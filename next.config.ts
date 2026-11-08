import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [
      {
        source: "/interview.html",
        destination: "/interview",
        permanent: false,
      },
      {
        source: "/legacy/interview.html",
        destination: "/interview",
        permanent: false,
      },
      { source: "/legacy/index.html", destination: "/", permanent: false },
      { source: "/legacy/observer.html", destination: "/", permanent: false },
      {
        source: "/legacy/peer-interview.html",
        destination: "/",
        permanent: false,
      },
      { source: "/legacy/peer-lobby.html", destination: "/", permanent: false },
      { source: "/legacy/replay.html", destination: "/", permanent: false },
      { source: "/legacy/task.html", destination: "/", permanent: false },
      {
        source: "/legacy/recording/index.html",
        destination: "/",
        permanent: false,
      },
      { source: "/index.html", destination: "/", permanent: false },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/problems/:path*", destination: "/legacy/problems/:path*" },
        { source: "/judges/:path*", destination: "/legacy/judges/:path*" },
        { source: "/vendor/:path*", destination: "/legacy/vendor/:path*" },
        { source: "/audio/:path*", destination: "/legacy/audio/:path*" },
      ],
    };
  },
};

export default nextConfig;
