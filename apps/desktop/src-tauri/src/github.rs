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

    /// Validate the token by calling `GET /user`, which works for both
    /// classic and fine-grained tokens and requires no permissions.
    ///
    /// Returns `Ok(true)` on success, `Ok(false)` when GitHub explicitly
    /// rejects the credentials (401/403), and `Err` for any other failure
    /// (network/TLS/unexpected status) so callers can surface the real
    /// reason instead of reporting a working token as "invalid".
    pub fn validate(&self) -> Result<bool, GitHubError> {
        let url = format!("{}/user", self.base_url);
        let response = self
            .request(&url)
            .send()
            .map_err(|e| GitHubError::Network(e.to_string()))?;
        let status = response.status();
        if status.is_success() {
            Ok(true)
        } else if status.as_u16() == 401 || status.as_u16() == 403 {
            Ok(false)
        } else {
            Err(GitHubError::Status(status.as_u16()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    #[test]
    fn parses_repository_from_url() {
        assert_eq!(
            repository_from_url("https://api.github.com/repos/octocat/hello-world"),
            "octocat/hello-world"
        );
        assert_eq!(repository_from_url("nonsense"), "nonsense");
    }

    /// Start a throwaway HTTP server that answers a single request with the
    /// given status line, returning its base URL.
    fn serve_once(status_line: &'static str) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buf = [0u8; 1024];
                let _ = stream.read(&mut buf);
                let body = "{}";
                let response = format!(
                    "HTTP/1.1 {status_line}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = stream.write_all(response.as_bytes());
            }
        });
        format!("http://{addr}")
    }

    #[test]
    fn validate_is_true_on_success() {
        let client = GitHubClient::with_base_url("tok", serve_once("200 OK"));
        assert!(client.validate().unwrap());
    }

    #[test]
    fn validate_is_false_when_unauthorized() {
        let client = GitHubClient::with_base_url("tok", serve_once("401 Unauthorized"));
        assert!(!client.validate().unwrap());
    }

    #[test]
    fn validate_errors_on_unexpected_status() {
        let client =
            GitHubClient::with_base_url("tok", serve_once("500 Internal Server Error"));
        assert!(client.validate().is_err());
    }
}
