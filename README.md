# Mitchell's Monitor

Monitors the status of GitHub pull requests. Checks for conflicts, status reports, reviews and whether the branch is up to date. Modern fork of 'Pull Request Monitor' by Erich Behrens.

![Statusbar items](images/statusBarItems.png)

**Color Codes**

| Color  | Icon                                     | Description                                                     |
| ------ | ---------------------------------------- | --------------------------------------------------------------- |
| Green  | ![color green](images/color-green.png)   | No conflicts, build passing (if any), reviews approved (if any) |
| Red    | ![color red](images/color-red.png)       | Conflicts, build failing, or pull request closed                |
| White  | ![color white](images/color-white.png)   | Waiting for status                                              |
| Violet | ![color violet](images/color-violet.png) | Merged                                                          |

**Pull Request State**

| Icon                                  | Description |
| ------------------------------------- | ----------- |
| ![icon](images/icon-state-open.png)   | Open        |
| ![icon](images/icon-state-merged.png) | Merged      |
| ![icon](images/icon-state-closed.png) | Closed      |

**Build Status**

| Icon                              | Description  |
| --------------------------------- | ------------ |
| ![icon](images/icon-build-ok.png) | Build passes |
| ![icon](images/icon-build-ko.png) | Build fails  |

**Branch Status**

| Icon                                       | Description             |
| ------------------------------------------ | ----------------------- |
| ![icon](images/icon-mergeable-ok.png)      | Mergeable               |
| ![icon](images/icon-mergeable-ko.png)      | Conflicts               |
| ![icon](images/icon-mergeable-unknown.png) | Unknown mergeable state |

**Review Status**

| Icon                                      | Description        |
| ----------------------------------------- | ------------------ |
| ![icon](images/icon-reviews-ok.png)       | Approved reviews   |
| ![icon](images/icon-reviews-ko.png)       | Changes requested  |
| ![icon](images/icon-reviews-comments.png) | There are comments |

## Instructions

- Install the extension

- Generate a GitHub token with the `public_repo` permission (if you wish to monitor private repositories too, include `repo`): https://github.com/settings/tokens

- Open the command palette and execute `mitchells-monitor.setToken`; after setting your token the extension will start monitoring your pull requests
