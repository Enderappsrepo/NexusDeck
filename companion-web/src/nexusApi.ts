const API_KEY_KEY = "nexusdeck_companion_api_key";

export function loadApiKey(): string {
  return localStorage.getItem(API_KEY_KEY) ?? "";
}

export function saveApiKey(key: string) {
  if (key.trim()) localStorage.setItem(API_KEY_KEY, key.trim());
  else localStorage.removeItem(API_KEY_KEY);
}

export interface ModHit {
  mod_id: number;
  name: string;
  author: string;
}

export interface ModFileHit {
  file_id: number;
  name: string;
  file_name: string;
  size_kb: number;
  version: string;
  is_primary: boolean;
}

/** Best-effort Nexus search from the browser (may fail if CORS blocks the API). */
export async function searchMods(
  apiKey: string,
  gameDomain: string,
  query: string
): Promise<ModHit[]> {
  const resp = await fetch("https://api.nexusmods.com/v2/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({
      query: `query($domain:String!,$term:String!){
        mods(filter:{gameDomain:{value:$domain},name:{value:$term, op:WILDCARD}}, count:15){
          nodes { modId name author }
        }
      }`,
      variables: { domain: gameDomain, term: `*${query}*` },
    }),
  });
  if (!resp.ok) throw new Error(`Nexus API error (${resp.status}). Try manual mod IDs below.`);
  const json = (await resp.json()) as {
    data?: { mods?: { nodes?: { modId: number; name: string; author: string }[] } };
    errors?: { message: string }[];
  };
  if (json.errors?.length) throw new Error(json.errors[0]?.message ?? "Nexus search failed.");
  return (json.data?.mods?.nodes ?? []).map((n) => ({
    mod_id: n.modId,
    name: n.name,
    author: n.author,
  }));
}

export async function getModFiles(
  apiKey: string,
  gameDomain: string,
  modId: number
): Promise<ModFileHit[]> {
  const resp = await fetch(
    `https://api.nexusmods.com/v1/games/${encodeURIComponent(gameDomain)}/mods/${modId}/files.json`,
    { headers: { apikey: apiKey } }
  );
  if (!resp.ok) throw new Error(`Couldn't load mod files (${resp.status}).`);
  const json = (await resp.json()) as {
    files?: {
      file_id: number;
      name: string;
      file_name: string;
      size_kb: number;
      version: string;
      is_primary: boolean;
    }[];
  };
  return (json.files ?? []).map((f) => ({
    file_id: f.file_id,
    name: f.name,
    file_name: f.file_name,
    size_kb: f.size_kb,
    version: f.version,
    is_primary: f.is_primary,
  }));
}
