# modelshare

modelshare (working name) is a web service for uploading neural-network model files (ONNX and safetensors), exploring them as interactive computation graphs or module trees with parameter statistics, and sharing them with fine-grained access control: private, specific users, or expiring links, with viewer, commenter, and editor roles. It is a React + Vite SPA backed by a Fastify (Node.js, TypeScript) API, MySQL accessed through raw SQL, and local-disk file storage. See [`docs/plans/modelshare-mvp.md`](docs/plans/modelshare-mvp.md) for the implementation plan.
