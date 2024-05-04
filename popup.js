const apiKey = "YOUR_API_KEY";

window.onload = async function () {
  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const jsonld = await executeScript(tab.id, retrieveJsonld);
    const seasonPath = getSeasonPath(jsonld);
    const imdbId = getImdbId(tab.url);
    if (imdbId) {
      fetchSubtitles(imdbId, seasonPath);
    }
  } catch (error) {
    console.error('Error:', error);
  }
};

async function executeScript(tabId, func) {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func,
  });
  return JSON.parse(result[0].result);
}

function getSeasonPath(jsonld) {
  if (jsonld["@type"] === "TVSeries") {
    const season = window.prompt("Enter the season number:", "");
    return `&season_number=${season}`;
  }
  return "";
}

function getImdbId(url) {
  const regex = /tt(\d+)/;
  const match = url.match(regex);
  return match ? match[0] : null;
}

function fetchSubtitles(imdbId, seasonPath) {
  const spinner = document.getElementById("spinner");
  spinner.style.display = "block";
  const cachedSubtitles = getWithExpiry(imdbId);
  if (cachedSubtitles) {
    createSubtitleList(cachedSubtitles);
    spinner.style.display = "none";
  } else {
    const apiUrl = `https://api.subdl.com/api/v1/subtitles?api_key=${apiKey}&languages=vi&imdb_id=${imdbId}${seasonPath}`;
    fetch(apiUrl)
      .then((response) => response.json())
      .then((data) => {
        spinner.style.display = "none";
        if (data.status === true && data.subtitles.length > 0) {
          setWithExpiry(imdbId, data.subtitles);
          createSubtitleList(data.subtitles);
        } else {
          window.close();
        }

      })
      .catch((error) => {
        spinner.style.display = "none";
        alert("Error:", error);
      });
  }
}

function createSubtitleList(subtitles) {
  const list = document.getElementById("subtitles");
  list.innerHTML = "";
  const sortedSubtitles = sortSubtitlesByQuality(subtitles);
  sortedSubtitles.forEach((subtitle) => {
    const listItem = document.createElement("li");
    const link = document.createElement("a");
    link.href = "#";
    link.textContent = subtitle.release_name;
    link.onclick = function () {
      fetch(`https://dl.subdl.com${subtitle.url}`)
        .then((response) => response.blob())
        .then((blob) => {
          extractZipFile(blob);
        })
        .catch((error) => alert("Error:", error));
      return false;
    };
    listItem.appendChild(link);
    list.appendChild(listItem);
  });
  list.style.width = "max-content";
}

function retrieveJsonld() {
  let jsonld = document.querySelector('script[type="application/ld+json"]');
  if (jsonld) {
    return jsonld.innerHTML;
  } else {
    return null;
  }
}

function extractZipFile(blob) {
  const zipFileReader = new zip.ZipReader(new zip.BlobReader(blob));
  zipFileReader
    .getEntries()
    .then((entries) => {
      entries.forEach((entry) => {
        entry.getData(new zip.BlobWriter()).then((blob) => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = entry.filename;
          link.click();
          URL.revokeObjectURL(url);
        });
      });
    })
    .catch((error) => {
      console.error("Error extracting ZIP file:", error);
    });
}

function getWithExpiry(key) {
  const itemStr = localStorage.getItem(key);
  if (!itemStr) {
    return null;
  }
  const item = JSON.parse(itemStr);
  const now = new Date();
  if (now.getTime() > item.expiry) {
    localStorage.removeItem(key);
    return null;
  }
  return item.value;
}

function setWithExpiry(key, data, ttl = 3600000) {
  const item = {
    data: data,
    expiry: new Date().getTime() + ttl,
  };
  localStorage.setItem(key, JSON.stringify(item));
}

function getQualityScore(release_name) {
  let score = 0;

  if (release_name.includes("BluRay") || release_name.includes("Blu-ray")) {
    score += 400;
  } else if (release_name.includes("WEB-DL")) {
    score += 300;
  } else if (release_name.includes("WEB-Rip")) {
    score += 200;
  } else {
    score += 100;
  }

  if (release_name.includes("2160p")) {
    score += 40;
  } else if (release_name.includes("1080p")) {
    score += 30;
  } else if (release_name.includes("720p")) {
    score += 20;
  } else {
    score += 10;
  }

  return score;
}

function sortSubtitlesByQuality(subtitles) {
  return subtitles.sort(
    (a, b) => getQualityScore(b.release_name) - getQualityScore(a.release_name)
  );
}
