use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, USER_AGENT};
use reqwest::{Client, Response};
use serde::{de::DeserializeOwned, Deserialize, Serialize};

use crate::error::{NexusDeckError, Result};
use crate::services::paths::platform_name;

const REST_BASE: &str = "https://api.nexusmods.com";
const GQL_ENDPOINT: &str = "https://api.nexusmods.com/v2/graphql";
const APP_NAME: &str = "NexusDeck";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NexusUser {
    pub user_id: u64,
    pub name: String,
    pub is_premium: bool,
    pub is_supporter: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadLink {
    pub name: String,
    pub uri: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModFileInfo {
    pub file_id: u64,
    pub name: String,
    #[serde(default)]
    pub file_name: String,
    pub version: String,
    pub category_id: u64,
    pub category_name: String,
    pub is_primary: bool,
    pub size_kb: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModSummary {
    pub mod_id: u64,
    pub name: String,
    pub summary: String,
    pub picture_url: Option<String>,
    pub author: String,
    pub endorsements: u64,
    pub mod_downloads: u64,
    pub updated_timestamp: u64,
    pub version: String,
    #[serde(default)]
    pub adult_content: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModCategory {
    pub category_id: u64,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModSearchFilters {
    pub category: Option<String>,
    pub tags: Vec<String>,
    pub min_endorsements: Option<u64>,
    pub hide_adult: bool,
    pub updated_since_days: Option<u32>,
}

impl Default for ModSearchFilters {
    fn default() -> Self {
        Self {
            category: None,
            tags: Vec::new(),
            min_endorsements: None,
            hide_adult: false,
            updated_since_days: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModSearchResult {
    pub mods: Vec<ModSummary>,
    pub total_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameSummary {
    pub id: u64,
    pub name: String,
    pub domain_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mod_count: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tile_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hero_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameListPage {
    pub games: Vec<GameSummary>,
    pub total_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct GameArtworkTemplates {
    v1_tile: Option<String>,
    v1_tile_blurred: Option<String>,
    v2_tile: Option<String>,
    v2_hero: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawRequirement {
    pub mod_id: u64,
    pub name: String,
    pub game_domain: String,
    pub optional: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionSummary {
    pub name: String,
    pub slug: String,
    pub summary: Option<String>,
    pub mod_count: u64,
    pub author: String,
    pub revision_number: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionModEntry {
    pub mod_id: u64,
    pub file_id: Option<u64>,
    pub name: String,
    pub optional: bool,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionDetail {
    pub name: String,
    pub slug: String,
    pub author: String,
    pub mod_count: u64,
    pub mods: Vec<CollectionModEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserEndorsement {
    pub game_domain: String,
    pub mod_id: u64,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdatedModEntry {
    pub mod_id: u64,
    pub name: String,
    pub updated_timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackedMod {
    pub game_domain: String,
    pub mod_id: u64,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModDetail {
    pub mod_id: u64,
    pub name: String,
    pub summary: String,
    pub description_html: String,
    pub author: String,
    pub uploader: String,
    pub category: String,
    pub endorsements: u64,
    pub mod_downloads: u64,
    pub updated_timestamp: u64,
    pub version: String,
    pub picture_url: Option<String>,
    pub hero_image_url: Option<String>,
    pub tags: Vec<String>,
    pub screenshots: Vec<String>,
    pub adult_content: bool,
    pub game_id: u64,
    pub game_domain: String,
    pub viewer_endorsed: bool,
    pub viewer_tracked: bool,
}

struct TokenBucket {
    tokens: f64,
    max_tokens: f64,
    refill_rate: f64,
    last_refill: Instant,
}

impl TokenBucket {
    fn new(max_tokens: f64) -> Self {
        Self {
            tokens: max_tokens,
            max_tokens,
            refill_rate: 1.0,
            last_refill: Instant::now(),
        }
    }

    fn refill(&mut self) {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_refill).as_secs_f64();
        self.tokens = (self.tokens + elapsed * self.refill_rate).min(self.max_tokens);
        self.last_refill = now;
    }

    fn try_consume(&mut self) -> bool {
        self.refill();
        if self.tokens >= 1.0 {
            self.tokens -= 1.0;
            true
        } else {
            false
        }
    }
}

struct CacheEntry {
    data: String,
    expires_at: Instant,
}

pub struct NexusClient {
    client: Client,
    api_key: Arc<Mutex<Option<String>>>,
    throttle: Arc<Mutex<TokenBucket>>,
    cache: Arc<Mutex<HashMap<String, CacheEntry>>>,
    is_premium: Arc<Mutex<bool>>,
}

impl NexusClient {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(30))
                .build()
                .expect("failed to build HTTP client"),
            api_key: Arc::new(Mutex::new(None)),
            throttle: Arc::new(Mutex::new(TokenBucket::new(300.0))),
            cache: Arc::new(Mutex::new(HashMap::new())),
            is_premium: Arc::new(Mutex::new(false)),
        }
    }

    pub fn set_api_key(&self, key: Option<String>) {
        *self.api_key.lock() = key;
    }

    pub fn set_premium(&self, premium: bool) {
        *self.is_premium.lock() = premium;
        let max = if premium { 600.0 } else { 300.0 };
        *self.throttle.lock() = TokenBucket::new(max);
    }

    fn build_headers(&self) -> Result<HeaderMap> {
        let mut headers = HeaderMap::new();
        headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
        headers.insert(
            "Application-Name",
            HeaderValue::from_static(APP_NAME),
        );
        headers.insert(
            "Application-Version",
            HeaderValue::from_str(env!("CARGO_PKG_VERSION"))
                .map_err(|e| NexusDeckError::Other(e.to_string()))?,
        );
        let ua = format!(
            "NexusDeck/{} ({})",
            env!("CARGO_PKG_VERSION"),
            platform_name()
        );
        headers.insert(USER_AGENT, HeaderValue::from_str(&ua).unwrap());

        if let Some(key) = self.api_key.lock().clone() {
            headers.insert(
                "apikey",
                HeaderValue::from_str(&key)
                    .map_err(|e| NexusDeckError::Other(e.to_string()))?,
            );
        }

        Ok(headers)
    }

    async fn wait_for_token(&self) {
        loop {
            if self.throttle.lock().try_consume() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    }

    async fn handle_response(&self, response: Response) -> Result<Response> {
        let status = response.status().as_u16();
        if status == 429 {
            let reset = response
                .headers()
                .get("x-ratelimit-reset")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("unknown")
                .to_string();
            return Err(NexusDeckError::RateLimited { reset_at: reset });
        }
        if !response.status().is_success() {
            let message = response.text().await.unwrap_or_default();
            if status == 403 && message.contains("premium") {
                return Err(NexusDeckError::PremiumRequired);
            }
            if status == 401 {
                return Err(NexusDeckError::InvalidApiKey);
            }
            return Err(NexusDeckError::NexusApi { status, message });
        }
        Ok(response)
    }

    pub async fn validate_api_key(&self) -> Result<NexusUser> {
        self.wait_for_token().await;
        let headers = self.build_headers()?;
        let response = self
            .client
            .get(format!("{REST_BASE}/v1/users/validate.json"))
            .headers(headers)
            .send()
            .await?;

        let response = self.handle_response(response).await?;
        let body: serde_json::Value = response.json().await?;

        let is_premium = body
            .get("is_premium")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        self.set_premium(is_premium);

        Ok(NexusUser {
            user_id: body.get("user_id").and_then(|v| v.as_u64()).unwrap_or(0),
            name: body
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string(),
            is_premium,
            is_supporter: body
                .get("is_supporter")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
        })
    }

    pub async fn graphql<T: DeserializeOwned>(
        &self,
        query: &str,
        variables: serde_json::Value,
    ) -> Result<T> {
        let cache_key = format!("gql:{}:{}", query, variables);
        if let Some(cached) = self.get_cache(&cache_key) {
            return Ok(serde_json::from_str(&cached)?);
        }

        self.wait_for_token().await;
        let headers = self.build_headers()?;
        let body = serde_json::json!({ "query": query, "variables": variables });

        let response = self
            .client
            .post(GQL_ENDPOINT)
            .headers(headers)
            .json(&body)
            .send()
            .await?;

        let response = self.handle_response(response).await?;
        let json: serde_json::Value = response.json().await?;

        if let Some(errors) = json.get("errors") {
            log::warn!("GraphQL errors: {errors}");
            return Err(NexusDeckError::NexusApi {
                status: 400,
                message: Self::format_graphql_errors(errors),
            });
        }

        let data = json.get("data").cloned().unwrap_or_default();
        let serialized = serde_json::to_string(&data)?;
        self.set_cache(&cache_key, &serialized, Duration::from_secs(600));
        Ok(serde_json::from_value(data)?)
    }

    pub async fn search_mods(
        &self,
        game_domain: &str,
        query: &str,
        sort: &str,
        offset: u32,
        count: u32,
    ) -> Result<Vec<ModSummary>> {
        let result = self
            .search_mods_with_filters(
                game_domain,
                query,
                sort,
                offset,
                count,
                &ModSearchFilters::default(),
            )
            .await?;
        Ok(result.mods)
    }

    fn build_mods_filter(game_domain: &str, query: &str, filters: &ModSearchFilters) -> serde_json::Value {
        let mut filter_parts = vec![serde_json::json!({
            "gameDomainName": [{ "value": game_domain, "op": "EQUALS" }]
        })];

        if !query.trim().is_empty() {
            filter_parts.push(serde_json::json!({
                "nameStemmed": [{ "value": query.trim(), "op": "MATCHES" }]
            }));
        }

        if let Some(category) = &filters.category {
            if !category.is_empty() {
                filter_parts.push(serde_json::json!({
                    "modCategoryName": [{ "value": category, "op": "EQUALS" }]
                }));
            }
        }

        for tag in &filters.tags {
            if !tag.is_empty() {
                filter_parts.push(serde_json::json!({
                    "tagName": [{ "value": tag, "op": "EQUALS" }]
                }));
            }
        }

        if let Some(min) = filters.min_endorsements {
            filter_parts.push(serde_json::json!({
                "endorsements": [{ "value": min, "op": "GTE" }]
            }));
        }

        if filters.hide_adult {
            filter_parts.push(serde_json::json!({
                "adultContent": [{ "value": false, "op": "EQUALS" }]
            }));
        }

        if let Some(days) = filters.updated_since_days {
            let since = chrono::Utc::now() - chrono::Duration::days(days as i64);
            filter_parts.push(serde_json::json!({
                "updatedAt": [{ "value": since.to_rfc3339(), "op": "GTE" }]
            }));
        }

        if filter_parts.len() == 1 {
            filter_parts.into_iter().next().unwrap()
        } else {
            serde_json::json!({ "op": "AND", "filter": filter_parts })
        }
    }

    pub async fn search_mods_with_filters(
        &self,
        game_domain: &str,
        query: &str,
        sort: &str,
        offset: u32,
        count: u32,
        filters: &ModSearchFilters,
    ) -> Result<ModSearchResult> {
        let sort_field = match sort {
            "endorsements" => "endorsements",
            "downloads" => "downloads",
            _ => "updatedAt",
        };

        let filter = Self::build_mods_filter(game_domain, query, filters);

        let gql = r#"
            query SearchMods($filter: ModsFilter, $sort: [ModsSort!], $offset: Int, $count: Int) {
                mods(filter: $filter, sort: $sort, offset: $offset, count: $count) {
                    nodes {
                        modId
                        name
                        summary
                        author
                        endorsements
                        downloads
                        updatedAt
                        version
                        pictureUrl
                        thumbnailUrl
                        adultContent
                    }
                    totalCount
                }
            }
        "#;

        let variables = serde_json::json!({
            "filter": filter,
            "sort": [{ sort_field: { "direction": "DESC" } }],
            "offset": offset,
            "count": count
        });

        let result: serde_json::Value = self.graphql(gql, variables).await?;
        let nodes = result
            .pointer("/mods/nodes")
            .and_then(|n| n.as_array())
            .cloned()
            .unwrap_or_default();

        let mods: Vec<ModSummary> = nodes
            .into_iter()
            .filter_map(parse_mod_summary)
            .collect();

        let total_count = result
            .pointer("/mods/totalCount")
            .and_then(|v| v.as_u64())
            .unwrap_or(mods.len() as u64);

        Ok(ModSearchResult { mods, total_count })
    }

    pub async fn list_mod_categories(&self, game_domain: &str) -> Result<Vec<ModCategory>> {
        let cache_key = format!("categories:{game_domain}");
        if let Some(cached) = self.get_cache(&cache_key) {
            return Ok(serde_json::from_str(&cached)?);
        }

        self.wait_for_token().await;
        let headers = self.build_headers()?;
        let url = format!("{REST_BASE}/v1/games/{game_domain}.json");
        let response = self.client.get(&url).headers(headers).send().await?;
        let response = self.handle_response(response).await?;
        let body: serde_json::Value = response.json().await?;

        let mut categories: Vec<ModCategory> = body
            .get("categories")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(parse_mod_category).collect())
            .unwrap_or_default();

        if categories.is_empty() {
            if let Some(game_id) = body.get("id").and_then(|v| v.as_u64()) {
                categories = self.fetch_categories_graphql(game_id).await?;
            }
        }

        categories.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        categories.dedup_by(|a, b| a.name.eq_ignore_ascii_case(&b.name));

        let serialized = serde_json::to_string(&categories)?;
        self.set_cache(&cache_key, &serialized, Duration::from_secs(86400));
        Ok(categories)
    }

    async fn fetch_categories_graphql(&self, game_id: u64) -> Result<Vec<ModCategory>> {
        let gql = r#"
            query ModCategories($gameId: Int) {
                categories(gameId: $gameId) {
                    id
                    name
                }
            }
        "#;

        let result: serde_json::Value = self
            .graphql(gql, serde_json::json!({ "gameId": game_id }))
            .await?;

        Ok(result
            .pointer("/categories")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(parse_mod_category).collect())
            .unwrap_or_default())
    }

    pub async fn get_trending_mods(&self, game_domain: &str, count: u32) -> Result<Vec<ModSummary>> {
        let result = self
            .search_mods_with_filters(
                game_domain,
                "",
                "downloads",
                0,
                count,
                &ModSearchFilters::default(),
            )
            .await?;
        Ok(result.mods)
    }

    pub async fn get_mod_detail(&self, game_domain: &str, mod_id: u64) -> Result<ModDetail> {
        let cache_key = format!("mod_detail:{game_domain}:{mod_id}");
        if let Some(cached) = self.get_cache(&cache_key) {
            return Ok(serde_json::from_str(&cached)?);
        }

        let gql = r#"
            query ModDetail($ids: [CompositeDomainWithIdInput!]!) {
                legacyModsByDomain(ids: $ids, count: 1) {
                    nodes {
                        modId
                        name
                        summary
                        description
                        author
                        endorsements
                        downloads
                        updatedAt
                        version
                        pictureUrl
                        thumbnailUrl
                        thumbnailLargeUrl
                        adultContent
                        modCategory { name }
                        tags { name }
                        uploader { name }
                        game { id domainName name }
                        viewerEndorsed
                        viewerTracked
                    }
                }
            }
        "#;

        let variables = serde_json::json!({
            "ids": [{ "gameDomain": game_domain, "modId": mod_id }]
        });

        let result: serde_json::Value = self.graphql(gql, variables).await?;
        let node = result
            .pointer("/legacyModsByDomain/nodes/0")
            .ok_or_else(|| NexusDeckError::NotFound(format!("Mod {mod_id} not found")))?;

        if node.is_null() {
            return Err(NexusDeckError::NotFound(format!("Mod {mod_id} not found")));
        }

        let description = node
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let picture_url = node
            .get("pictureUrl")
            .or_else(|| node.get("thumbnailUrl"))
            .and_then(|v| v.as_str())
            .map(String::from);

        let hero_image_url = node
            .get("thumbnailLargeUrl")
            .or_else(|| node.get("pictureUrl"))
            .or_else(|| node.get("thumbnailUrl"))
            .and_then(|v| v.as_str())
            .map(String::from);

        let mut screenshots = extract_image_urls(&description);
        if let Some(hero) = &hero_image_url {
            if !screenshots.iter().any(|u| u == hero) {
                screenshots.insert(0, hero.clone());
            }
        } else if let Some(picture) = &picture_url {
            if !screenshots.iter().any(|u| u == picture) {
                screenshots.insert(0, picture.clone());
            }
        }

        let tags: Vec<String> = node
            .get("tags")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|t| t.get("name").and_then(|n| n.as_str()).map(String::from))
                    .collect()
            })
            .unwrap_or_default();

        let detail = ModDetail {
            mod_id: node.get("modId").and_then(|v| v.as_u64()).unwrap_or(mod_id),
            name: node
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown mod")
                .to_string(),
            summary: node
                .get("summary")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            description_html: description,
            author: node
                .get("author")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string(),
            uploader: node
                .pointer("/uploader/name")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string(),
            category: node
                .pointer("/modCategory/name")
                .and_then(|v| v.as_str())
                .unwrap_or("Uncategorized")
                .to_string(),
            endorsements: node.get("endorsements").and_then(|v| v.as_u64()).unwrap_or(0),
            mod_downloads: node.get("downloads").and_then(|v| v.as_u64()).unwrap_or(0),
            updated_timestamp: parse_nexus_timestamp(node.get("updatedAt")),
            version: node
                .get("version")
                .and_then(|v| v.as_str())
                .unwrap_or("0")
                .to_string(),
            picture_url,
            hero_image_url,
            tags,
            screenshots,
            adult_content: node
                .get("adultContent")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            game_id: node
                .pointer("/game/id")
                .and_then(|v| v.as_u64())
                .unwrap_or(0),
            game_domain: node
                .pointer("/game/domainName")
                .and_then(|v| v.as_str())
                .unwrap_or(game_domain)
                .to_string(),
            viewer_endorsed: node
                .get("viewerEndorsed")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            viewer_tracked: node
                .get("viewerTracked")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
        };

        let serialized = serde_json::to_string(&detail)?;
        self.set_cache(&cache_key, &serialized, Duration::from_secs(900));
        Ok(detail)
    }

    pub async fn get_mod_files(&self, game_domain: &str, mod_id: u64) -> Result<Vec<ModFileInfo>> {
        let cache_key = format!("files:{game_domain}:{mod_id}");
        if let Some(cached) = self.get_cache(&cache_key) {
            return Ok(serde_json::from_str(&cached)?);
        }

        self.wait_for_token().await;
        let headers = self.build_headers()?;
        let url = format!("{REST_BASE}/v1/games/{game_domain}/mods/{mod_id}/files.json");

        let response = self.client.get(&url).headers(headers).send().await?;
        let response = self.handle_response(response).await?;
        let body: serde_json::Value = response.json().await?;

        let files: Vec<ModFileInfo> = body
            .get("files")
            .and_then(|f| f.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|f| {
                        Some(ModFileInfo {
                            file_id: f.get("file_id")?.as_u64()?,
                            name: f.get("name")?.as_str()?.to_string(),
                            file_name: f
                                .get("file_name")
                                .and_then(|v| v.as_str())
                                .filter(|s| !s.is_empty())
                                .map(String::from)
                                .unwrap_or_else(|| f.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string()),
                            version: f
                                .get("version")
                                .and_then(|v| v.as_str())
                                .unwrap_or("0")
                                .to_string(),
                            category_id: f.get("category_id").and_then(|v| v.as_u64()).unwrap_or(0),
                            category_name: f
                                .get("category_name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            is_primary: f.get("is_primary").and_then(|v| v.as_bool()).unwrap_or(false),
                            size_kb: f.get("size_kb").and_then(|v| v.as_u64()).unwrap_or(0),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        let serialized = serde_json::to_string(&files)?;
        self.set_cache(&cache_key, &serialized, Duration::from_secs(300));
        Ok(files)
    }

    pub async fn get_download_links(
        &self,
        game_domain: &str,
        mod_id: u64,
        file_id: u64,
    ) -> Result<Vec<DownloadLink>> {
        self.wait_for_token().await;
        let headers = self.build_headers()?;
        let url = format!(
            "{REST_BASE}/v1/games/{game_domain}/mods/{mod_id}/files/{file_id}/download_link.json"
        );

        let response = self.client.get(&url).headers(headers).send().await?;
        let response = self.handle_response(response).await?;
        let body: serde_json::Value = response.json().await?;

        let links: Vec<DownloadLink> = body
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|l| {
                        Some(DownloadLink {
                            name: l.get("name")?.as_str()?.to_string(),
                            uri: l.get("URI").or_else(|| l.get("uri"))?.as_str()?.to_string(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        Ok(links)
    }

    pub async fn list_games(
        &self,
        query: &str,
        count: u32,
        offset: u32,
    ) -> Result<GameListPage> {
        let filter = if query.is_empty() {
            serde_json::Value::Null
        } else {
            serde_json::json!({
                "name": [{ "value": query, "op": "WILDCARD" }]
            })
        };

        let gql = r#"
            query ListGames($filter: GamesSearchFilter, $count: Int, $offset: Int) {
                games(
                    filter: $filter,
                    count: $count,
                    offset: $offset,
                    sort: [{ name: { direction: ASC } }]
                ) {
                    nodes {
                        id
                        name
                        domainName
                        modCount
                        genre
                        artworkSchema
                    }
                    totalCount
                }
            }
        "#;

        let result: serde_json::Value = self
            .graphql(
                gql,
                serde_json::json!({ "filter": filter, "count": count, "offset": offset }),
            )
            .await?;

        let templates = self.load_game_artwork_templates().await.ok();
        let total_count = result
            .pointer("/games/totalCount")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);

        let games = result
            .pointer("/games/nodes")
            .and_then(|n| n.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|node| parse_game_summary_node(node, templates.as_ref()))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        Ok(GameListPage { games, total_count })
    }

    async fn load_game_artwork_templates(&self) -> Result<GameArtworkTemplates> {
        if let Some(cached) = self.get_cache("game_artwork_templates") {
            if let Ok(templates) = serde_json::from_str::<GameArtworkTemplates>(&cached) {
                return Ok(templates);
            }
        }

        let gql = r#"
            query GameArtwork {
                gameArtwork {
                    schemaV1 { tile tileBlurred }
                    schemaV2 { tile hero thumbnail }
                }
            }
        "#;

        let result: serde_json::Value = self.graphql(gql, serde_json::json!({})).await?;
        let root = result.get("gameArtwork").ok_or_else(|| {
            NexusDeckError::Other("Missing gameArtwork in GraphQL response".into())
        })?;

        let templates = GameArtworkTemplates {
            v1_tile: root
                .pointer("/schemaV1/tile")
                .and_then(|v| v.as_str())
                .map(str::to_string),
            v1_tile_blurred: root
                .pointer("/schemaV1/tileBlurred")
                .and_then(|v| v.as_str())
                .map(str::to_string),
            v2_tile: root
                .pointer("/schemaV2/tile")
                .and_then(|v| v.as_str())
                .map(str::to_string),
            v2_hero: root
                .pointer("/schemaV2/hero")
                .and_then(|v| v.as_str())
                .map(str::to_string),
        };

        if let Ok(raw) = serde_json::to_string(&templates) {
            self.set_cache("game_artwork_templates", &raw, Duration::from_secs(86400));
        }

        Ok(templates)
    }

    pub async fn get_mod_requirements(
        &self,
        game_domain: &str,
        mod_id: u64,
    ) -> Result<Vec<RawRequirement>> {
        let cache_key = format!("mod_reqs:{game_domain}:{mod_id}");
        if let Some(cached) = self.get_cache(&cache_key) {
            return Ok(serde_json::from_str(&cached)?);
        }

        let requirements = match self.fetch_requirements_rest(game_domain, mod_id).await {
            Ok(reqs) => reqs,
            Err(e) => {
                log::warn!(
                    "REST mod requirements failed for {game_domain}/{mod_id}: {e}; trying GraphQL"
                );
                self.fetch_requirements_graphql(game_domain, mod_id)
                    .await
                    .unwrap_or_default()
            }
        };

        let serialized = serde_json::to_string(&requirements)?;
        self.set_cache(&cache_key, &serialized, Duration::from_secs(900));
        Ok(requirements)
    }

    async fn fetch_requirements_graphql(
        &self,
        game_domain: &str,
        mod_id: u64,
    ) -> Result<Vec<RawRequirement>> {
        let gql = r#"
            query ModReqs($ids: [CompositeDomainWithIdInput!]!) {
                legacyModsByDomain(ids: $ids, count: 1) {
                    nodes {
                        modRequirements {
                            nexusRequirements(count: 50) {
                                nodes {
                                    modId
                                    modName
                                    gameId
                                    externalRequirement
                                    url
                                }
                            }
                        }
                    }
                }
            }
        "#;

        let variables = serde_json::json!({
            "ids": [{ "domainName": game_domain, "modId": mod_id }]
        });

        let result: serde_json::Value = self.graphql(gql, variables).await?;
        Ok(result
            .pointer("/legacyModsByDomain/nodes/0/modRequirements/nexusRequirements/nodes")
            .and_then(|n| n.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|r| {
                        if r.get("externalRequirement")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false)
                        {
                            return None;
                        }
                        let mod_id = r.get("modId")?.as_u64().or_else(|| {
                            r.get("modId")?.as_str()?.parse().ok()
                        })?;
                        Some(RawRequirement {
                            mod_id,
                            name: r
                                .get("modName")
                                .and_then(|v| v.as_str())
                                .unwrap_or("Unknown")
                                .to_string(),
                            game_domain: game_domain.to_string(),
                            optional: false,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default())
    }

    async fn fetch_requirements_rest(
        &self,
        game_domain: &str,
        mod_id: u64,
    ) -> Result<Vec<RawRequirement>> {
        self.wait_for_token().await;
        let headers = self.build_headers()?;
        let url = format!("{REST_BASE}/v1/games/{game_domain}/mods/{mod_id}.json");
        let response = self.client.get(&url).headers(headers).send().await?;
        let response = self.handle_response(response).await?;
        let body: serde_json::Value = response.json().await?;

        Ok(body
            .get("requirements")
            .and_then(|r| r.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|r| {
                        Some(RawRequirement {
                            mod_id: r.get("mod_id")?.as_u64()?,
                            name: r
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("Unknown")
                                .to_string(),
                            game_domain: r
                                .get("domain_name")
                                .and_then(|v| v.as_str())
                                .unwrap_or(game_domain)
                                .to_string(),
                            optional: r.get("is_optional").and_then(|v| v.as_bool()).unwrap_or(false),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default())
    }

    pub async fn list_collections(
        &self,
        game_domain: &str,
        offset: u32,
        count: u32,
    ) -> Result<Vec<CollectionSummary>> {
        let gql = r#"
            query Collections($filter: CollectionsSearchFilter, $offset: Int, $count: Int) {
                collectionsV2(filter: $filter, offset: $offset, count: $count) {
                    nodes {
                        name
                        slug
                        summary
                        user { name }
                        latestPublishedRevision {
                            modCount
                            revisionNumber
                        }
                    }
                }
            }
        "#;

        let variables = serde_json::json!({
            "filter": {
                "gameDomain": [{ "value": game_domain, "op": "EQUALS" }],
                "collectionStatus": [{ "value": "listed", "op": "EQUALS" }]
            },
            "offset": offset,
            "count": count
        });

        let result: serde_json::Value = self.graphql(gql, variables).await?;
        Ok(result
            .pointer("/collectionsV2/nodes")
            .and_then(|n| n.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|c| {
                        Some(CollectionSummary {
                            name: c.get("name")?.as_str()?.to_string(),
                            slug: c.get("slug")?.as_str()?.to_string(),
                            summary: c
                                .get("summary")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string()),
                            mod_count: c
                                .pointer("/latestPublishedRevision/modCount")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(0),
                            author: c
                                .pointer("/user/name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("Unknown")
                                .to_string(),
                            revision_number: c
                                .pointer("/latestPublishedRevision/revisionNumber")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(0),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default())
    }

    pub async fn get_collection(
        &self,
        game_domain: &str,
        slug: &str,
    ) -> Result<CollectionDetail> {
        let cache_key = format!("collection:{game_domain}:{slug}");
        if let Some(cached) = self.get_cache(&cache_key) {
            return Ok(serde_json::from_str(&cached)?);
        }

        let gql = r#"
            query CollectionDetail($slug: String!, $domainName: String!) {
                collection(slug: $slug, domainName: $domainName) {
                    name
                    slug
                    user { name }
                    latestPublishedRevision {
                        modCount
                        modFiles {
                            fileId
                            optional
                            version
                            file {
                                modId
                                name
                                mod { modId name version }
                            }
                        }
                    }
                }
            }
        "#;

        let result: serde_json::Value = self
            .graphql(
                gql,
                serde_json::json!({ "slug": slug, "domainName": game_domain }),
            )
            .await?;

        let node = result
            .pointer("/collection")
            .ok_or_else(|| NexusDeckError::NotFound(format!("Collection {slug} not found")))?;

        let revision = node.get("latestPublishedRevision");
        let mod_count = revision
            .and_then(|r| r.get("modCount"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0);

        let mods: Vec<CollectionModEntry> = revision
            .and_then(|r| r.get("modFiles"))
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|entry| {
                        let file = entry.get("file")?;
                        let mod_id = file
                            .get("modId")
                            .and_then(|v| v.as_u64())
                            .or_else(|| {
                                file.pointer("/mod/modId")
                                    .and_then(|v| v.as_u64())
                            })?;
                        Some(CollectionModEntry {
                            mod_id,
                            file_id: entry.get("fileId").and_then(|v| v.as_u64()),
                            name: file
                                .pointer("/mod/name")
                                .and_then(|v| v.as_str())
                                .or_else(|| file.get("name").and_then(|v| v.as_str()))
                                .unwrap_or("Unknown")
                                .to_string(),
                            optional: entry
                                .get("optional")
                                .and_then(|v| v.as_bool())
                                .unwrap_or(false),
                            version: entry
                                .get("version")
                                .and_then(|v| v.as_str())
                                .or_else(|| {
                                    file.pointer("/mod/version")
                                        .and_then(|v| v.as_str())
                                })
                                .unwrap_or("0")
                                .to_string(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        let detail = CollectionDetail {
            name: node
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or(slug)
                .to_string(),
            slug: node
                .get("slug")
                .and_then(|v| v.as_str())
                .unwrap_or(slug)
                .to_string(),
            author: node
                .pointer("/user/name")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string(),
            mod_count,
            mods,
        };

        let serialized = serde_json::to_string(&detail)?;
        self.set_cache(&cache_key, &serialized, Duration::from_secs(1800));
        Ok(detail)
    }

    fn format_graphql_errors(errors: &serde_json::Value) -> String {
        if let Some(arr) = errors.as_array() {
            if let Some(first) = arr.first() {
                if let Some(msg) = first.get("message").and_then(|m| m.as_str()) {
                    return msg.to_string();
                }
            }
        }
        "Request failed. Check your API key or try again.".to_string()
    }

    pub async fn endorse_mod(&self, game_domain: &str, mod_id: u64, version: &str) -> Result<()> {
        self.wait_for_token().await;
        let headers = self.build_headers()?;
        let url = format!("{REST_BASE}/v1/games/{game_domain}/mods/{mod_id}/endorse.json");
        let response = self
            .client
            .post(&url)
            .headers(headers)
            .json(&serde_json::json!({ "version": version }))
            .send()
            .await?;
        self.handle_response(response).await?;
        Ok(())
    }

    pub async fn abstain_mod(&self, game_domain: &str, mod_id: u64) -> Result<()> {
        self.wait_for_token().await;
        let headers = self.build_headers()?;
        let url = format!("{REST_BASE}/v1/games/{game_domain}/mods/{mod_id}/abstain.json");
        let response = self.client.post(&url).headers(headers).send().await?;
        self.handle_response(response).await?;
        Ok(())
    }

    pub async fn get_user_endorsements(&self) -> Result<Vec<UserEndorsement>> {
        self.wait_for_token().await;
        let headers = self.build_headers()?;
        let url = format!("{REST_BASE}/v1/user/endorsements.json");
        let response = self.client.get(&url).headers(headers).send().await?;
        let response = self.handle_response(response).await?;
        let body: serde_json::Value = response.json().await?;

        Ok(body
            .as_array()
            .or_else(|| body.get("endorsements").and_then(|v| v.as_array()))
            .map(|arr| {
                arr.iter()
                    .filter_map(|e| {
                        Some(UserEndorsement {
                            game_domain: json_str(e, &["domain_name", "domainName"])?
                                .to_string(),
                            mod_id: json_u64(e, &["mod_id", "modId"])?,
                            version: e
                                .get("version")
                                .and_then(|v| v.as_str())
                                .unwrap_or("0")
                                .to_string(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default())
    }

    pub async fn get_updated_mods(
        &self,
        game_domain: &str,
        period: &str,
    ) -> Result<Vec<UpdatedModEntry>> {
        let cache_key = format!("updated:{game_domain}:{period}");
        if let Some(cached) = self.get_cache(&cache_key) {
            return Ok(serde_json::from_str(&cached)?);
        }

        self.wait_for_token().await;
        let headers = self.build_headers()?;
        let url = format!("{REST_BASE}/v1/games/{game_domain}/mods/updated.json?period={period}");
        let response = self.client.get(&url).headers(headers).send().await?;
        let response = self.handle_response(response).await?;
        let body: serde_json::Value = response.json().await?;

        let entries: Vec<UpdatedModEntry> = body
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|e| {
                        Some(UpdatedModEntry {
                            mod_id: e.get("mod_id")?.as_u64()?,
                            name: e
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("Unknown")
                                .to_string(),
                            updated_timestamp: e
                                .get("updated_timestamp")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(0),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        let serialized = serde_json::to_string(&entries)?;
        self.set_cache(&cache_key, &serialized, Duration::from_secs(21600));
        Ok(entries)
    }

    pub async fn track_mod(&self, game_domain: &str, mod_id: u64) -> Result<()> {
        self.wait_for_token().await;
        let headers = self.build_headers()?;
        let url = format!("{REST_BASE}/v1/games/{game_domain}/mods/{mod_id}/track.json");
        let response = self.client.post(&url).headers(headers).send().await?;
        self.handle_response(response).await?;
        Ok(())
    }

    pub async fn list_tracked_mods(&self) -> Result<Vec<TrackedMod>> {
        self.wait_for_token().await;
        let headers = self.build_headers()?;
        let url = format!("{REST_BASE}/v1/user/tracked_mods.json");
        let response = self.client.get(&url).headers(headers).send().await?;
        let response = self.handle_response(response).await?;
        let body: serde_json::Value = response.json().await?;

        let mut mods = parse_tracked_mods_response(&body);
        for tracked in &mut mods {
            if tracked.name.trim().is_empty() {
                tracked.name = self
                    .lookup_mod_name(&tracked.game_domain, tracked.mod_id)
                    .await
                    .unwrap_or_else(|_| format!("Mod #{}", tracked.mod_id));
            }
        }
        Ok(mods)
    }

    async fn lookup_mod_name(&self, game_domain: &str, mod_id: u64) -> Result<String> {
        Ok(self.get_mod_detail(game_domain, mod_id).await?.name)
    }

    fn get_cache(&self, key: &str) -> Option<String> {
        let cache = self.cache.lock();
        cache.get(key).and_then(|entry| {
            if entry.expires_at > Instant::now() {
                Some(entry.data.clone())
            } else {
                None
            }
        })
    }

    fn set_cache(&self, key: &str, data: &str, ttl: Duration) {
        let mut cache = self.cache.lock();
        cache.insert(
            key.to_string(),
            CacheEntry {
                data: data.to_string(),
                expires_at: Instant::now() + ttl,
            },
        );
    }
}

impl Default for NexusClient {
    fn default() -> Self {
        Self::new()
    }
}

fn parse_tracked_mods_response(body: &serde_json::Value) -> Vec<TrackedMod> {
    let arr = body
        .as_array()
        .or_else(|| body.get("tracked_mods").and_then(|v| v.as_array()))
        .or_else(|| body.get("trackedMods").and_then(|v| v.as_array()));

    let Some(arr) = arr else {
        return Vec::new();
    };

    arr.iter()
        .filter_map(|e| {
            let game_domain = json_str(e, &["domain_name", "domainName", "game_domain"])?;
            let mod_id = json_u64(e, &["mod_id", "modId"])?;
            let name = json_str(e, &["name", "mod_name"]).unwrap_or("").to_string();
            Some(TrackedMod {
                game_domain: game_domain.to_string(),
                mod_id,
                name,
            })
        })
        .collect()
}

fn json_u64(value: &serde_json::Value, keys: &[&str]) -> Option<u64> {
    for key in keys {
        if let Some(v) = value.get(*key) {
            if let Some(n) = v.as_u64() {
                return Some(n);
            }
            if let Some(s) = v.as_str() {
                if let Ok(n) = s.parse() {
                    return Some(n);
                }
            }
        }
    }
    None
}

fn resolve_artwork_url(template: &str, game_id: u64) -> String {
    let id = game_id.to_string();
    template
        .replace("{gameId}", &id)
        .replace("{game_id}", &id)
        .replace("{id}", &id)
}

fn artwork_for_game(
    templates: Option<&GameArtworkTemplates>,
    game_id: u64,
    artwork_schema: Option<&str>,
) -> (Option<String>, Option<String>) {
    let Some(templates) = templates else {
        return (None, None);
    };
    let schema = artwork_schema.unwrap_or("V2");
    if schema.eq_ignore_ascii_case("V2") {
        (
            templates
                .v2_tile
                .as_ref()
                .map(|t| resolve_artwork_url(t, game_id)),
            templates
                .v2_hero
                .as_ref()
                .map(|t| resolve_artwork_url(t, game_id)),
        )
    } else {
        (
            templates
                .v1_tile
                .as_ref()
                .map(|t| resolve_artwork_url(t, game_id)),
            templates
                .v1_tile_blurred
                .as_ref()
                .map(|t| resolve_artwork_url(t, game_id)),
        )
    }
}

fn parse_game_summary_node(
    node: &serde_json::Value,
    templates: Option<&GameArtworkTemplates>,
) -> Option<GameSummary> {
    let id = node
        .get("id")
        .and_then(|v| v.as_u64())
        .or_else(|| node.get("id").and_then(|v| v.as_str())?.parse().ok())?;
    let name = json_str(node, &["name"])?.to_string();
    let domain_name =
        json_str(node, &["domain_name", "domainName", "domain", "game_domain"])?.to_string();
    let mod_count = json_u64(node, &["mod_count", "modCount"]);
    let genre = json_str(node, &["genre"]).map(str::to_string);
    let artwork_schema = json_str(node, &["artworkSchema", "artwork_schema"]);
    let (tile_url, hero_url) = artwork_for_game(templates, id, artwork_schema);
    Some(GameSummary {
        id,
        name,
        domain_name,
        mod_count,
        genre,
        tile_url,
        hero_url,
    })
}

fn json_str<'a>(value: &'a serde_json::Value, keys: &[&str]) -> Option<&'a str> {
    for key in keys {
        if let Some(s) = value.get(*key).and_then(|v| v.as_str()) {
            if !s.is_empty() {
                return Some(s);
            }
        }
    }
    None
}

fn parse_mod_category(c: &serde_json::Value) -> Option<ModCategory> {
    let name = c.get("name")?.as_str()?.trim();
    if name.is_empty() {
        return None;
    }

    let category_id = c
        .get("category_id")
        .and_then(|v| v.as_u64())
        .or_else(|| c.get("categoryId").and_then(|v| v.as_u64()))
        .or_else(|| c.get("id").and_then(|v| v.as_u64()))
        .or_else(|| {
            c.get("id")
                .and_then(|v| v.as_str())
                .and_then(|s| s.split(',').next())
                .and_then(|s| s.trim().parse().ok())
        })
        .unwrap_or(0);

    Some(ModCategory {
        category_id,
        name: name.to_string(),
    })
}

fn parse_mod_summary(node: serde_json::Value) -> Option<ModSummary> {
    let picture_url = node
        .get("pictureUrl")
        .or_else(|| node.get("thumbnailUrl"))
        .and_then(|v| v.as_str())
        .map(String::from);

    Some(ModSummary {
        mod_id: node.get("modId")?.as_u64()?,
        name: node.get("name")?.as_str()?.to_string(),
        summary: node
            .get("summary")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        picture_url,
        author: node
            .get("author")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown")
            .to_string(),
        endorsements: node
            .get("endorsements")
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
        mod_downloads: node.get("downloads").and_then(|v| v.as_u64()).unwrap_or(0),
        updated_timestamp: parse_nexus_timestamp(node.get("updatedAt")),
        version: node
            .get("version")
            .and_then(|v| v.as_str())
            .unwrap_or("0")
            .to_string(),
        adult_content: node
            .get("adultContent")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
    })
}

fn parse_nexus_timestamp(value: Option<&serde_json::Value>) -> u64 {
    let Some(value) = value else {
        return 0;
    };
    if let Some(ts) = value.as_u64() {
        return ts;
    }
    if let Some(text) = value.as_str() {
        if let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(text) {
            return parsed.timestamp() as u64;
        }
    }
    0
}

fn extract_image_urls(content: &str) -> Vec<String> {
    let mut urls = Vec::new();

    let mut search_from = 0;
    let lower = content.to_lowercase();
    while let Some(rel) = lower[search_from..].find("[img]") {
        let start = search_from + rel + 5;
        if let Some(end) = lower[start..].find("[/img]") {
            let url = content[start..start + end].trim();
            if is_mod_image_url(url) && !urls.iter().any(|u| u == url) {
                urls.push(url.to_string());
            }
            search_from = start + end + 6;
        } else {
            break;
        }
    }

    for pattern in ["src=\"", "src='", "href=\""] {
        let quote = pattern.chars().last().unwrap();
        let mut search_from = 0;
        while let Some(rel) = content[search_from..].find(pattern) {
            let start = search_from + rel + pattern.len();
            if let Some(end) = content[start..].find(quote) {
                let url = content[start..start + end].trim();
                if is_mod_image_url(url) && !urls.iter().any(|u| u == url) {
                    urls.push(url.to_string());
                }
            }
            search_from = start.saturating_add(1);
        }
    }
    urls
}

fn is_mod_image_url(url: &str) -> bool {
    if !url.starts_with("http") {
        return false;
    }
    let lower = url.to_lowercase();
    lower.contains("nexusmods.com")
        || lower.contains("staticdelivery.nexusmods.com")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".png")
        || lower.ends_with(".webp")
        || lower.ends_with(".gif")
}
