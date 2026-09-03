import type { NextConfig } from 'next';
import WebpackLicensePlugin from 'webpack-license-plugin';

const isDev = process.env.NODE_ENV === 'development';

const noticesRule = '-'.repeat(74);

const nextConfig: NextConfig = {
    output: isDev ? 'standalone' : 'export',
    trailingSlash: true,
    skipTrailingSlashRedirect: true,
    reactCompiler: true,
    images: {
        unoptimized: true,
    },
    rewrites: isDev
        ? async function rewrites() {
              if (!isDev) return [];
              return [
                  {
                      source: '/api/:path*',
                      destination: 'http://localhost:3333/api/:path*',
                  },
              ];
          }
        : undefined,
    // Only the client compilation: its chunk graph is what actually ships in
    // wwwroot. 'static' is the folder the export copies, so the text file ends
    // up in out/_next/static/ and travels with the build artifact, while the
    // plugin's own JSON stays behind in .next.
    webpack(config, { isServer }) {
        if (!isDev && !isServer) {
            config.plugins.push(
                new WebpackLicensePlugin({
                    includeNoticeText: true,
                    additionalFiles: {
                        'static/third-party-licenses.txt': packages =>
                            packages
                                .map(p =>
                                    [
                                        noticesRule,
                                        `${p.name}@${p.version}`,
                                        noticesRule,
                                        '',
                                        p.licenseText,
                                        ...(p.noticeText ? ['', p.noticeText] : []),
                                        '',
                                    ].join('\n'),
                                )
                                .join('\n'),
                    },
                }),
            );
        }
        return config;
    },
};

export default nextConfig;
