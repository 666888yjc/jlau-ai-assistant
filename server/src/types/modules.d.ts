// CloudBase 文档库 SDK（tcb-admin-node）在 MVP 本地验证时不一定安装；
// 此处给出最小环境声明，保证 TypeScript 编译通过，运行时按需动态加载。
declare module 'tcb-admin-node' {
  const tcb: any;
  export = tcb;
}
