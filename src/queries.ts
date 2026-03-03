export const viewer = `query {
  viewer {
    login
      pullRequests(last: @count @states) {
          nodes {
            repository{
              name
              nameWithOwner
              owner {
                login
              }
            }
            number
            mergeable
            state
            isDraft
            title
            url
            updatedAt
            commits(last: 1){
              nodes{
                commit{
                  statusCheckRollup{
                    state
                  }
                }
              }
            }
            reviewDecision
            reviews(first: 10) {
              edges {
                node {
                  state
                  author {
                    login
                  }
                }
              }
            }
          }
    }
  }
}`;

export const repository = `{
  repository(owner: "@owner" name: "@name") {
    pullRequests(last: @count @states) {
      nodes {
        repository{
          name
          nameWithOwner
          owner {
            login
          }
        }
        number
        mergeable
        state
        isDraft
        title
        url
        updatedAt
        commits(last: 1){
          nodes{
            commit{
              statusCheckRollup{
                state
              }
            }
          }
        }
        reviewDecision
        reviews(first: 10) {
          edges {
            node {
              state
              author {
                login
              }
            }
          }
        }
      }
    }
  }
}`;

export const repositories = `query {
  viewer {
    login
    repositories(first: 100) {
      nodes{
        name
        nameWithOwner
        owner {
          login
        }
      }
    }
  }
}`;
