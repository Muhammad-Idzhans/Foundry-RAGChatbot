import { NextResponse } from "next/server";

export async function GET() {
    const speechKey = process.env.AZURE_SPEECH_KEY;
    const speechRegion = process.env.AZURE_SPEECH_REGION;

    if (!speechKey || !speechRegion) {
        return NextResponse.json({ error: "Speech credentials not configured" }, { status: 500 });
    }

    // Ask Azure to issue a short-lived token
    const tokenRes = await fetch(
        `https://${speechRegion}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
        {
            method: "POST",
            headers: { "Ocp-Apim-Subscription-Key": speechKey },
        }
    );

    const token = await tokenRes.text();
    return NextResponse.json({ token, region: speechRegion });
}
