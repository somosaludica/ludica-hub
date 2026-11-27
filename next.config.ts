import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Comprovante de pagamento vai junto no formulário (até 4 MB; a Vercel aceita 4,5 MB por envio).
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  // Sistema interno com dados financeiros: não abre dentro de outros sites, não vaza endereço,
  // não aparece em buscadores e não usa câmera, microfone nem localização.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
