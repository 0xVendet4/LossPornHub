/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // wagmi/walletconnect puxam deps opcionais que não existem no bundle
    config.externals.push("pino-pretty", "lokijs", "encoding");
    // SDK da Coinbase importa módulos x402 opcionais que não vêm instalados
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/core/client": false,
      "@x402/evm": false,
      "@x402/evm/exact/client": false,
      "@x402/evm/upto/client": false,
      "@x402/svm/exact/client": false,
    };
    return config;
  },
};
export default nextConfig;
