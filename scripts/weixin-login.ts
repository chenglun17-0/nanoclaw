#!/usr/bin/env node
import { loginWeixin } from '../src/weixin-login.js';

loginWeixin()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('登录失败:', err.message);
    process.exit(1);
  });
