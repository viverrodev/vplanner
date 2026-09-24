/** True if url is a public file in OUR Supabase storage, inside bucket/folder/. */
export function isOwnStorageUrl(url: string, bucket: string, folder: string) {
  try {
    const u = new URL(url);
    const ours = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
    return (
      u.protocol === "https:" &&
      u.host === ours.host &&
      u.pathname.startsWith(`/storage/v1/object/public/${bucket}/${folder}/`)
    );
  } catch {
    return false;
  }
}
