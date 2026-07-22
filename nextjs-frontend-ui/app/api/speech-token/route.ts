import { NextResponse } from "next/server";

export async function GET() {
    const speechKey = process.env.AZURE_SPEECH_KEY;
    const speechEndpoint = process.env.AZURE_SPEECH_ENDPOINT; // e.g. https://demo-cashflow-foundry.cognitiveservices.azure.com/

    if (!speechKey || !speechEndpoint) {
        return NextResponse.json({ error: "Speech credentials not configured" }, { status: 500 });
    }

    // Remove trailing slash from endpoint for consistent URL building
    const baseEndpoint = speechEndpoint.replace(/\/+$/, "");

    // Ask Azure Foundry to issue a short-lived token
    const tokenRes = await fetch(
        `${baseEndpoint}/sts/v1.0/issueToken`,
        {
            method: "POST",
            headers: { "Ocp-Apim-Subscription-Key": speechKey },
        }
    );

    if (!tokenRes.ok) {
        const errorText = await tokenRes.text();
        console.error("Failed to fetch speech token:", errorText);
        return NextResponse.json({ error: "Failed to fetch speech token" }, { status: 500 });
    }

    const token = await tokenRes.text();
    return NextResponse.json({ token, endpoint: baseEndpoint });
}
