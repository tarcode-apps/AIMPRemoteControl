import type { NextConfig } from 'next';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import WebpackLicensePlugin from 'webpack-license-plugin';

const require = createRequire(import.meta.url);

const fontPackages = ['@fontsource-variable/material-symbols-outlined'].map(name =>
    dirname(require.resolve(`${name}/package.json`)),
);

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
    experimental: isDev
        ? {
              proxyTimeout: 5 * 60 * 1000,
          }
        : undefined,
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
                    includePackages: () => fontPackages,
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
