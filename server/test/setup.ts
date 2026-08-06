// 测试前置：在测试文件导入应用前设定环境变量（setupFiles 先于测试模块求值）。
process.env.STORE_KIND = 'memory'; // 内存存储，零 IO、可重复
process.env.COZE_MOCK = 'true'; // 强制 mock 流（即使未来注入 token）
process.env.RATE_WINDOW_MS = '60000';
process.env.RATE_DATA_MAX = '1000';
process.env.RATE_CHAT_MAX = '1000';
process.env.PORT = '0';
