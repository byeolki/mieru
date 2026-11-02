# mieru

mieru (見える, "visible") is a web service for uploading neural-network model files (ONNX and safetensors), exploring them as interactive computation graphs or module trees with parameter statistics, and sharing them with fine-grained access control: private, specific people, expiring links, or public, with viewer, commenter, and editor roles and forks. It is a React + Vite SPA backed by a Fastify (Node.js, TypeScript) API, MySQL accessed through raw SQL, and local-disk storage, deployed with Dokploy. See [`docs/plans/mieru.md`](docs/plans/mieru.md) for the implementation plan.
