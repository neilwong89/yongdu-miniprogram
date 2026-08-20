module.exports = {
  apps: [
    {
      name: 'yongdu-api',
      script: 'src/index.js',
      cwd: '/opt/yongdu/api-server',
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        PORT: 3012,
      },
    },
  ],
};
