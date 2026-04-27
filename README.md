# imocto-admin

基于 React + Vite + TypeScript + Ant Design 构建的 imocto 后台管理系统。

## 技术栈

- React 18
- Vite 6
- TypeScript 5
- Ant Design 5
- React Router 6
- Zustand(状态管理)
- Axios(HTTP 客户端)

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 类型检查 + 生产构建
npm run build

# 本地预览构建产物
npm run preview
```

## 环境变量

- `.env.development` — 开发环境
- `.env.production` — 生产环境
- `.env.local` — 本地覆盖(不入库)

## 部署

项目提供 `Dockerfile` 与 `nginx.conf.template`,可直接构建镜像部署。

```bash
docker build -t imocto-admin .
```

## 目录结构

```
src/
├── pages/        页面组件
├── store/        Zustand 状态
├── styles/       全局样式与设计 token
└── ...
```
