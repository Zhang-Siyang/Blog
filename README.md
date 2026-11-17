[![Netlify Status](https://api.netlify.com/api/v1/badges/620f2c69-3d18-4217-b525-5c871a18f50a/deploy-status)](https://app.netlify.com/sites/sy/deploys)

首页默认展示 Tech，点击 Life 切换到 `/life/`，不记忆上次选择。

- 技术文章写在 `content-tech/`，生活文章写在 `content-life/`，无需额外分类字段。
- 两类文章都保留 `/posts/<slug 或文件名>/` 地址；`draft = true` 的文章不发布。
- `/index.xml` 继续订阅全部已发布文章，不随当前分类筛选。
- 分类切换使用静态页面链接，不依赖 JavaScript 或 Local Storage。
