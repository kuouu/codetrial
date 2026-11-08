export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      signedIn: false,
      identityVerified: false,
      githubSignedIn: false,
      loginRequired: false,
      guestModeAvailable: true,
      deviceLogin: false,
      maxDurationMin: 90,
      candidateVideo: false,
      peerEnabled: false,
      taskModeEnabled: false,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
