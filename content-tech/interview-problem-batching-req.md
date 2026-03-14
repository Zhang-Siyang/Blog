+++
date = '2026-02-27T02:25:02+08:00'
draft = false
title = '关于一道面试题的分析：Batching HTTP 请求'
tags = ['tech']
+++

最近在找工作，其中一家公司提出这道题目。

背景：`FacesDetact()` 只能串行调用，现在希望为程序添加批量处理功能，但不允许设置 delay 时间窗口，来一个请求，处理一个请求

分析：请求将会乱序到达，如果不设置数量或时间方面的窗口，其实程序需要处理的目标是积压态的网络请求（协程）

思路：如果需要对分散且独立到达的事件（参RxTS）做批量处理，其中必然需要有一个收束的阶段。如果能意识到这种现象的存在，最好是能意识到，可以针对该渠道做 batching 处理。在积压出现的时候，把被积压的请求进行批量取出，批量调用，然后返回

当时没有回答得很好，在处理请求装饰器的时候手忙脚乱，请求可以收拢，但生命周期如何管理呢？可能还是常见的编程范式用多了，哈哈，后来和 GPT 聊天，它虽然没有给出正确的答案，但它对 channel 的熟练运用到是给了我启发

Go 有「share memory by communicating」，我们可以控制权逆转，让我们的 handler 陷入 <-chan 的等待状态（当时是预期进行接口 HiJack）

后来想想，这不就是批量扇出扇入吗？查了下资料，的确是几乎完全一致的题目

下附草稿解答

```golang {hl_lines="63-93"}
package main

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sync"
	"time"
)

func main() {
	http.HandleFunc("/faces:detact", FacesDetactHandler)
	http.HandleFunc("/faces:detactv2", FacesDetactHandlerV2)

	const listenAt = ":8080"
	fmt.Printf("serve at %s\n", listenAt)
	err := http.ListenAndServe(listenAt, http.DefaultServeMux)

	if err != nil {
		fmt.Printf("http.ListenAndServe failed: %+v\n", err)
	}
}

type Image []byte

type Face struct{} /* position etc. */

type DetactResult struct {
	Faces []Face `json:"faces"`
}

func FacesDetactHandler(w http.ResponseWriter, r *http.Request) {
	type Req struct {
		Image Image `json:"image"`
	}
	var req Req
	var err error
	{
		err = json.NewDecoder(r.Body).Decode(&req)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprintf(w, "error: %+v", err)
			return
		}
	}

	result := FacesDetact([]Image{req.Image})

	json.NewEncoder(w).Encode(result[0])
}

type QueueItem struct {
	Image         Image
	ResultWriteTo chan<- DetactResult // FIXME 可以根据情况分析有没有必要配置 len=1 的 buffer
}

var queue chan QueueItem

var FacesDetactHandlerV2Initial = sync.OnceFunc(func() {
	const maxBatchSize = 128
	queue = make(chan QueueItem, maxBatchSize+1)
	go func() {
		for {
			for queueIten := range queue {
				var todo = []QueueItem{queueIten}
				if len(queue) > 0 {
					consumeQuota := maxBatchSize - len(todo)
					if consumeQuota > len(queue) {
						consumeQuota = len(queue)
					}
					for i := 0; i < consumeQuota; i++ {
						todo = append(todo, <-queue)
					}
				}

				var args []Image = make([]Image, len(todo))
				{
					for index, req := range todo {
						args[index] = req.Image
					}
				}

				// enable to check how many req has been batching
				// fmt.Printf("args.length = %d\n", len(args))
				results := FacesDetact(args)

				for index, result := range results {
					todo[index].ResultWriteTo <- result
				}
			}
		}
	}()
})

func FacesDetactHandlerV2(w http.ResponseWriter, r *http.Request) {
	type Req struct {
		Image Image `json:"image"`
	}
	var req Req
	var err error
	{
		err = json.NewDecoder(r.Body).Decode(&req)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprintf(w, "error: %+v", err)
			return
		}
	}

	FacesDetactHandlerV2Initial()

	resultQueue := make(chan DetactResult, 1)

	queueReq := QueueItem{
		Image:         req.Image,
		ResultWriteTo: resultQueue,
	}

	queue <- queueReq

	result := <-resultQueue

	json.NewEncoder(w).Encode(result)
}

var FacesDetactLocker sync.Mutex    // 以防外部函数错误并行调用

// FacesDetact 执行图像序列处理，因 GPU 底层限制，本函数不支持并行调用，请注意
// images 与 results 为一对一的关系。本函数有冷启动时间，处理时间随图像数量近双曲线
func FacesDetact(images []Image) (results []DetactResult) {
	if len(images) <= 0 {
		return
	}
	FacesDetactLocker.Lock()
	defer FacesDetactLocker.Unlock()

	results = make([]DetactResult, len(images))

	time.Sleep(time.Duration(math.Pow(float64(len(images)), 0.1)) * 100 * time.Millisecond)

	return
}
```

在面试结束后重写优化以及调试的时候，观察数据会很有趣，因为机械压测带来的流量（like wrk but wrk2）很有规律，联合起 poolSize、具体耗时曲线、请求到达频次、放行逻辑，它们组成了一个可供线性规划的区域。

此时此刻理解了 Java 仔，「这些都是可以调优的空间」。

队列中的压力、消费速度，其实都是函数曲线的一部分

自己测试中发现 Apifox 的压测启动速度真的超逊，远远不如 wrk。

BTW. 也许可以 vibe 一个 wrk2-go #TODO