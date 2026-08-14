# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Deploying to Tapis Pods

The image serves the built SPA with nginx on **port 5000**, which is the port
Tapis Pods route to. If your pod definition uses a different
`networking.port`, override it at run time — no rebuild needed:

```
-e PORT=8080
```

Build and push for the **cluster's architecture**. A plain `docker build` on
an Apple Silicon Mac produces a linux/arm64 image that the x86_64 pod hosts
cannot run, and the failure surfaces as a 502 from the ingress:

```bash
docker buildx build --platform linux/amd64 \
  --build-arg VITE_TAPIS_API_URL=https://icicle.tapis.io \
  --build-arg VITE_SLURM_ACCOUNT=<account> \
  --build-arg VITE_USE_MOCK_SERVICES=false \
  --build-arg VITE_AVAILABILITY_API_URL=https://<availability-host> \
  --build-arg VITE_CHAT_API_URL=https://<assist-host> \
  -t <registry>/geoharmonizer-ui:<tag> --push .
```

`VITE_*` values are inlined into the bundle at build time, so they must be
passed as `--build-arg`. Setting them on the running container does nothing.

### Checking a failed deploy

```bash
curl -s https://tapis.io/v3/pods/<pod_id>       -H "X-Tapis-Token: $TOKEN"  # status
curl -s https://tapis.io/v3/pods/<pod_id>/logs  -H "X-Tapis-Token: $TOKEN"  # container logs
```

A 502 means the ingress reached the pod but nothing answered on the routed
port: wrong port, wrong image architecture, or a container that exited.
