[![Netlify Status](https://api.netlify.com/api/v1/badges/620f2c69-3d18-4217-b525-5c871a18f50a/deploy-status)](https://app.netlify.com/sites/sy/deploys)

首次访问首页默认展示 Tech；点击 Life 后记住选择，再次访问首页仍展示 Life。

- 技术文章写在 `content-tech/`，生活文章写在 `content-life/`，无需额外分类字段。
- 两类文章都保留 `/posts/<slug 或文件名>/` 地址；`draft = true` 的文章不发布。
- `/index.xml` 继续订阅全部已发布文章，不随当前分类筛选。
- 使用 `/?tab=tech` 和 `/?tab=life` 显式切换，URL 参数优先于 Local Storage 中的选择。
- 直接打开文章不会改变偏好；从文章点击站名回首页时恢复上次选择。
- 浏览器禁用存储时仍可用 URL 参数切换，但无法记住选择。
