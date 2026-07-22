import { NextResponse } from "next/server";
import { DefaultAzureCredential } from "@azure/identity";
import {
    BlobServiceClient,
    generateBlobSASQueryParameters,
    BlobSASPermissions,
    SASProtocol,
} from "@azure/storage-blob";

export async function POST(req: Request) {
    try {
        const { blobUrl } = await req.json();
        if (!blobUrl) {
            return NextResponse.json({ error: "blobUrl is required" }, { status: 400 });
        }

        // Parse: https://botragsstorage.blob.core.windows.net/hartalega-blobstorage/file.pdf
        const url = new URL(blobUrl);
        const accountName = url.hostname.split(".")[0];
        const pathParts = url.pathname.split("/").filter(Boolean);
        // Important: URL decode the container and blob name so spaces aren't treated as '%20' in the SAS signature
        const containerName = decodeURIComponent(pathParts[0]);
        const blobName = decodeURIComponent(pathParts.slice(1).join("/"));

        const credential = new DefaultAzureCredential();
        const blobServiceClient = new BlobServiceClient(
            `https://${accountName}.blob.core.windows.net`,
            credential
        );

        const now = new Date();
        const startsOn = new Date(now.getTime() - 5 * 60 * 1000);   // 5 min buffer
        const expiresOn = new Date(now.getTime() + 60 * 60 * 1000);  // 1 hour

        const userDelegationKey = await blobServiceClient.getUserDelegationKey(startsOn, expiresOn);

        const sasToken = generateBlobSASQueryParameters(
            {
                containerName,
                blobName,
                permissions: BlobSASPermissions.parse("r"),
                startsOn,
                expiresOn,
                protocol: SASProtocol.Https,
            },
            userDelegationKey,
            accountName
        ).toString();

        return NextResponse.json({ signedUrl: `${blobUrl}?${sasToken}` });
    } catch (error) {
        console.error("Error generating SAS token:", error);
        return NextResponse.json({ error: "Failed to generate signed URL" }, { status: 500 });
    }
}