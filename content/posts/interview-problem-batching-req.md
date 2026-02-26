+++
date = '2026-02-27T02:25:02+08:00'
draft = false
title = '关于一道面试题的分析：Batching HTTP 请求'
+++

最近在找工作，其中一家公司提出这道题目。

背景：`FacesDetact()` 只能串行调用，现在希望为程序添加批量处理功能，但不允许设置 delay 时间窗口，来一个请求，处理一个请求

分析：请求将会乱序到达，如果不设置双上限（达到数量 or timer 到期），其实程序无法优化`第一个请求`，需要处理的目标换成了后续积压的请求

思路：建立某种 buffer，既然目标是 batch 调用，那么就在积压出现的时候，把被积压的请求进行批量取出，批量调用，然后返回

当时没有回答得很好，在处理请求 warper 的时候手忙脚乱，在 API 生命周期管理也没有做好。后面和 AI 聊天，虽然它没有给出解答，但出乎意料地给了我如何协调`等待与响应`的想法：可以使用 channel 呀！

也就是，可以把 chan 作为参数传递给消费者，也契合了 Go 的「share memory by communicating」

后来想想，这不就是批量扇出扇入吗？// 大概是吧，明天我确认一下

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
	ResultWriteTo chan<- DetactResult // 最好设置 buffer=1 ?
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

其实这个题目也可以接下来讲下去。因为 poolSize、具体耗时曲线、请求到达频次、放行逻辑，它们组成了一个可供线性规划的区域。

此时此刻理解了 Java 仔，「这些都是可以调优的空间」。明天再改稿子吧

备忘一下：其实服务运行稳定角度也可以讲，如果崩溃怎么办，GC是不是有压力、Apifox 的压测启动又慢又不如 wrk

TODO：vibe 一个 wrk2-go