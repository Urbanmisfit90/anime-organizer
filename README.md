# Anime Organizer

A local Node.js application for browsing an anime library, renaming
episode files, and finding missing episodes.

## Features

-   Browse anime folders through a local web interface.
-   Rename video files using episode titles retrieved from online
    episode databases.
-   Scan one anime folder and generate a missing-episodes report.
-   Scan the entire configured anime library and generate a master
    report.
-   Use a local `episodes.txt` file as an episode-list override.

## Requirements

-   [Node.js](https://nodejs.org/) installed (Node.js 18 or newer is
    recommended; the scripts use the built-in `fetch` API).
-   npm, included with Node.js.
-   On the default configuration, an anime library at `D:\Anime`.
-   An internet connection when episode information must be retrieved
    from Jikan/MyAnimeList or TVmaze.

## Installation

Open a terminal in the project root (the directory containing
`package.json`) and run:

``` bash
npm install
```

## Run the web application

Start the local server:

``` bash
npm start
```

Then open <http://localhost:2468> in your browser.

The server serves the static interface from the `public` directory and
reads the anime library from `D:\Anime`.

To stop the server, press `Ctrl+C` in the terminal.

## Available npm commands

  -----------------------------------------------------------------------
  Command                             Purpose
  ----------------------------------- -----------------------------------
  `npm install`                       Install the project's dependencies.

  `npm start`                         Start the web server on port
                                      `2468`.

  `npm run batch-scan`                Scan all top-level anime folders
                                      under `D:\Anime` and create a
                                      master missing-episodes report when
                                      episodes are missing.

  `npm test`                          Currently not implemented; this
                                      command intentionally exits with an
                                      error because no test suite is
                                      configured.
  -----------------------------------------------------------------------

## Command-line utilities

Run these commands from the project root. Replace the example paths and
titles with values that match your library.

### Scan one anime folder for missing episodes

``` bash
node find_missing_anime.js "D:\Anime\Show Name" "Show Name" "Show Name"
```

Arguments:

1.  `D:\Anime\Show Name` --- full path to the folder to scan.
2.  `Show Name` --- folder selection/name used to determine the show
    title and season context.
3.  `Show Name` --- optional search title to use when looking up episode
    data online.

The third argument is optional. If omitted, the script derives a search
title from the folder selection. If a usable local `episodes.txt` file
is found, it is used instead of looking up episode data online.

When missing episodes are found, the script writes
`Missing_Episodes.txt` into the target folder.

### Rename episode files in one anime folder

**Warning:** `universal_renamer.js` currently has `DRY_RUN = false`, so
it renames files immediately. Back up the folder first and verify your
episode data before running this command.

``` bash
node universal_renamer.js "D:\Anime\Show Name" "Show Name" "Show Name"
```

Arguments:

1.  Full path to the target anime folder.
2.  Folder selection/name used to determine the show title and season
    context.
3.  Optional search title for online episode lookup.

The renamer attempts to name files in this format:

``` text
Show Name - S01EP01 - Episode Title.mkv
```

The actual extension is preserved. Existing destination files are
skipped rather than overwritten. The script may use a local
`episodes.txt` file if one is found.

### Scan the entire library

``` bash
npm run batch-scan
```

The batch scanner is currently hard-coded to scan:

``` text
D:\Anime
```

It checks each top-level folder and writes `Master_Missing_Report.txt`
in the configured base directory if missing episodes are found. To use a
different library path, change the `BASE_DIR` constant in both
`batch_missing_scanner.js` and `server.js` to the appropriate path
before running the commands.

## Local episode lists (`episodes.txt`)

A local `episodes.txt` can be used when online episode lookup is
unavailable or returns the wrong episode list. The utility checks the
target directory and its parent directory for `episodes.txt` (and also
checks for `episodes.txt.txt`).

Use one episode per line. For example:

``` text
1 - First Episode
2 - Second Episode
Episode 3: Third Episode
04 - Fourth Episode
```

The number at the start of each line is treated as the episode number.
Keep the list aligned with the numbering used by your local video
filenames.

## Supported video files and episode naming

The scanner searches recursively for files ending in `.mp4`, `.mkv`,
`.avi`, or `.m4v`. It skips subfolders whose names begin with
`specials`, `ova`, `ovas`, `movies`, or `extras`.

Episode numbers can be detected from common patterns such as `S01E01`,
`EP01`, `Episode 01`, `E01`, `- 01`, or a leading number such as
`01 - Title`.

## Online episode data

When a local `episodes.txt` file is not available, the scripts query:

-   Jikan API (MyAnimeList data) for anime and episode information.
-   TVmaze as a fallback source.

Results depend on the titles returned by these services and their
availability. Check the generated report and episode list for accuracy,
especially for shows with specials, split cours, alternate versions, or
unusual numbering.

## Output files

  ----------------------------------------------------------------------------------
  File                          Created by                   Location
  ----------------------------- ---------------------------- -----------------------
  `Missing_Episodes.txt`        `find_missing_anime.js`      Target anime folder,
                                                             when episodes are
                                                             missing.

  `Master_Missing_Report.txt`   `batch_missing_scanner.js`   `D:\Anime`, when
                                                             episodes are missing.
  ----------------------------------------------------------------------------------

## Troubleshooting

-   **The app shows no folders:** Confirm that `D:\Anime` exists, or
    update `BASE_DIR` in `server.js` to your library location.
-   **The batch scanner says the base directory does not exist:** Update
    `BASE_DIR` in `batch_missing_scanner.js` or create the configured
    directory.
-   **Episode lookup fails:** Check your internet connection, verify the
    show's title, or add a local `episodes.txt` file.
-   **The wrong episodes are reported:** Confirm that episode numbering
    in `episodes.txt` or the online data matches the filenames in your
    library.
-   **`npm test` fails:** This is expected until a test suite is added
    and the `test` script in `package.json` is updated.

## Project scripts and files

-   `server.js` --- Express web server and API endpoints.
-   `public/` --- static web interface served by Express.
-   `universal_renamer.js` --- renames episode files.
-   `find_missing_anime.js` --- scans one show folder for missing
    episodes.
-   `batch_missing_scanner.js` --- scans all top-level folders in the
    configured library.
-   `anime_utils.js` --- shared folder scanning, episode parsing, and
    online lookup helpers.
-   `package.json` / `package-lock.json` --- project metadata,
    dependencies, and npm scripts.

## Repository

[Urbanmisfit90/anime-organizer](https://github.com/Urbanmisfit90/anime-organizer)
