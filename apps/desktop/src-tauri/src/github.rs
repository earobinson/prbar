use serde::Deserialize;

use crate::models::Match;

#[derive(Debug, thiserror::Error)]
pub enum GitHubError {
    #[error("network error: {0}")]
    Network(String),
    #[error("github returned status {0}")]
    Status(u16),
    #[error("failed to parse github response: {0}")]
    Parse(String),
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    #[serde(default)]
    items: Vec<SearchItem>,
}

#[derive(Debug, Deserialize)]
struct SearchItem {
    number: i64,
    title: String,
    html_url: String,
    updated_at: String,
    repository_url: String,
    #[serde(default)]
    pull_request: Option<serde_json::Value>,
}

/// Derive "owner/name" from a GitHub repository_url such as
/// "https://api.github.com/repos/octocat/hello-world".
fn repository_from_url(repository_url: &str) -> String {
    match repository_url.split_once("/repos/") {
        Some((_, rest)) => rest.to_string(),
        None => repository_url.to_string(),
    }
}

/// Blocking GitHub client. PRBar does not parse search syntax; the query
/// is passed directly to the `/search/issues` endpoint.
pub struct GitHubClient {
    token: String,
    base_url: String,
    client: reqwest::blocking::Client,
}

impl GitHubClient {
    pub fn new(token: impl Into<String>) -> Self {
        Self::with_base_url(token, "https://api.github.com")
    }

    pub fn with_base_url(token: impl Into<String>, base_url: impl Into<String>) -> Self {
        GitHubClient {
            token: token.into(),
            base_url: base_url.into().trim_end_matches('/').to_string(),
            client: reqwest::blocking::Client::new(),
        }
    }

    fn request(&self, url: &str) -> reqwest::blocking::RequestBuilder {
        self.client
            .get(url)
            .header("Accept", "application/vnd.github+json")
            .header("Authorization", format!("Bearer {}", self.token))
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header("User-Agent", "PRBar")
    }

    pub fn search_pull_requests(
        &self,
        query_id: &str,
        query: &str,
    ) -> Result<Vec<Match>, GitHubError> {
        let url = format!(
            "{}/search/issues?q={}&per_page=100",
            self.base_url,
            urlencoding::encode(query)
        );
        let response = self
            .request(&url)
            .send()
            .map_err(|e| GitHubError::Network(e.to_string()))?;

        if !response.status().is_success() {
            return Err(GitHubError::Status(response.status().as_u16()));
        }

        let body: SearchResponse = response
            .json()
            .map_err(|e| GitHubError::Parse(e.to_string()))?;

        Ok(body
            .items
            .into_iter()
            .filter(|item| item.pull_request.is_some())
            .map(|item| Match {
                query_id: query_id.to_string(),
                pull_request_id: item.number,
                repository: repository_from_url(&item.repository_url),
                title: item.title,
                url: item.html_url,
                updated_at: item.updated_at,
            })
            .collect())
    }

    pub fn validate(&self) -> bool {
        let url = format!("{}/user", self.base_url);
        match self.request(&url).send() {
            Ok(response) => response.status().is_success(),
            Err(_) => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_repository_from_url() {
        assert_eq!(
            repository_from_url("https://api.github.com/repos/octocat/hello-world"),
            "octocat/hello-world"
        );
        assert_eq!(repository_from_url("nonsense"), "nonsense");
    }
}
