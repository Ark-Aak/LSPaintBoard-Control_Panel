## 运行依赖

本脚本基于 NodeJS v18.20.4 编写。

## 启动方式

克隆本仓库后执行如下命令启动：

```shell
npm install
node main.js
```

## 使用方式

本脚本默认在本地 `3001` 端口启动 Web 服务。

脚本会把 Token 存储在 `tokens.txt` 中，可以按照如下格式一行一个手动添加：

```plain
["fill your token here", uid]
```
请注意在文件的**最后留下一个换行**。

然后点击网页的 获取 Token 即可立刻应用更新。
