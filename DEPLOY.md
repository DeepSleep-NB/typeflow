# 发布到 GitHub

这个目录已经是一个可以发布的完整项目，三种方式任选其一。

## 方式一：一键脚本（推荐，无需安装 git）

需要 GitHub 的 classic Personal Access Token，勾选 `repo` + `workflow` 两个 scope：

<https://github.com/settings/tokens/new>

```powershell
cd typeflow
.\publish.ps1 -Token ghp_你的token
```

脚本会做这些事：

1. 调用 API 创建公开仓库 `typeflow`（重名则复用）；
2. 把全部文件一次性提交到 `main` 分支；
3. 开启 GitHub Pages；
4. 打印仓库地址与在线演示地址。

常用参数：`-RepoName 名字`、`-Private`、`-Description "描述"`、`-SkipPages`。

## 方式二：手动 git

```bash
cd typeflow
git init -b main
git add .
git commit -m "feat: TypeFlow 极简打字速度测试"
git remote add origin https://github.com/DeepSleep-NB/typeflow.git
git push -u origin main
```

推送后在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**，等 workflow 跑完即可访问
`https://deepsleep-nb.github.io/typeflow/`。

## 方式三：网页上传

1. 在 GitHub 点 **New repository**，名字填 `typeflow`，选 **Public**，不要勾 README；
2. 进入空仓库点 **uploading an existing file**；
3. 把本目录下**除 `.zip` 外的所有文件**拖进去（注意保留 `.github/`、`assets/`、`docs/` 的目录结构）；
4. 提交后到 **Settings → Pages** 选择 `main` 分支根目录。

## 发布后建议做的事

- 仓库已指向 `DeepSleep-NB/typeflow`，徽章与克隆地址可直接使用；
- 在仓库 **About** 里填一句简介，勾上 Website（指向 Pages 地址）；
- 加几个 Topics：`typing-test`、`vanilla-js`、`web-app`、`no-dependencies`。

## 关于网络

如果 `github.com` 打不开但 `api.github.com` 正常，说明只有网页域名被重置。
可以在 `C:\Windows\System32\drivers\etc\hosts` 里加一行（需要管理员权限）：

```
140.82.114.3 github.com
140.82.114.3 www.github.com
```

若你装了 Watt Toolkit 之类的加速工具，直接用它的一键加速更省事。
