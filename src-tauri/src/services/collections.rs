use crate::error::Result;
use crate::services::nexus_client::{
    CollectionDetail, CollectionSummary, NexusClient,
};

pub async fn list_collections(
    nexus: &NexusClient,
    domain: &str,
    offset: u32,
    count: u32,
) -> Result<Vec<CollectionSummary>> {
    nexus.list_collections(domain, offset, count).await
}

pub async fn get_collection_detail(
    nexus: &NexusClient,
    game_domain: &str,
    slug: &str,
) -> Result<CollectionDetail> {
    nexus.get_collection(game_domain, slug).await
}
