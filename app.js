const form = document.querySelector("#search-form");
const cityInput = document.querySelector("#city-input");
const statusMessage = document.querySelector("#status");
const weatherCard = document.querySelector("#weather-card");
const forecastSection = document.querySelector("#forecast-section");
const forecastList = document.querySelector("#forecast-list");
const searchButton = form.querySelector("button");
const locationButton = document.querySelector("#location-button");
const saveCityButton = document.querySelector("#save-city-button");
const openSavedButton = document.querySelector("#open-saved-button");
const closeSavedButton = document.querySelector("#close-saved-button");
const savedDrawer = document.querySelector("#saved-drawer");
const drawerBackdrop = document.querySelector("#drawer-backdrop");
const savedCount = document.querySelector("#saved-count");
const savedEmpty = document.querySelector("#saved-empty");
const savedList = document.querySelector("#saved-list");
const recentSection = document.querySelector("#recent-section");
const recentList = document.querySelector("#recent-list");
const advisory = document.querySelector("#advisory");
const advisoryIcon = document.querySelector("#advisory-icon");
const advisoryMessage = document.querySelector("#advisory-message");

const RECENT_CITIES_KEY = "weather-recent-cities";
const SAVED_CITIES_KEY = "weather-saved-cities";
let currentPlace = null;
let drawerTrigger = null;

const elements = {
  location: document.querySelector("#location"),
  currentIcon: document.querySelector("#current-icon"),
  condition: document.querySelector("#condition"),
  localTime: document.querySelector("#local-time"),
  temperature: document.querySelector("#temperature"),
  feelsLike: document.querySelector("#feels-like"),
  humidity: document.querySelector("#humidity"),
  windSpeed: document.querySelector("#wind-speed"),
};

const weatherDescriptions = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Foggy", 48: "Rime fog", 51: "Light drizzle", 53: "Drizzle",
  55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 80: "Rain showers",
  81: "Rain showers", 82: "Heavy showers", 95: "Thunderstorm",
  96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
};

function readStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? [];
  } catch {
    return [];
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getPlaceLabel(place) {
  return place.displayName ?? (
    place.admin1 ? `${place.name}, ${place.admin1}, ${place.country}` : `${place.name}, ${place.country}`
  );
}

function makeCityChip(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "city-chip";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function makeSavedCityChip(place) {
  const wrapper = document.createElement("span");
  wrapper.className = "saved-city";
  const label = getPlaceLabel(place);
  const openButton = makeCityChip(label, () => loadSavedPlace(place));
  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "remove-city";
  removeButton.textContent = "×";
  removeButton.setAttribute("aria-label", `Remove ${label} from saved cities`);
  removeButton.addEventListener("click", () => {
    const remaining = readStorage(SAVED_CITIES_KEY)
      .filter((savedPlace) => savedPlace.displayName !== place.displayName);
    writeStorage(SAVED_CITIES_KEY, remaining);
    renderQuickLocations();
    if (currentPlace?.displayName === place.displayName) {
      saveCityButton.disabled = false;
      saveCityButton.textContent = "☆ Save city";
    }
  });
  wrapper.append(openButton, removeButton);
  return wrapper;
}

function renderQuickLocations() {
  const savedCities = readStorage(SAVED_CITIES_KEY);
  const recentCities = readStorage(RECENT_CITIES_KEY);

  savedList.replaceChildren(...savedCities.map(makeSavedCityChip));
  recentList.replaceChildren(...recentCities.map((city) =>
    makeCityChip(city, () => {
      cityInput.value = city;
      form.requestSubmit();
    })
  ));

  savedCount.textContent = savedCities.length;
  savedEmpty.hidden = savedCities.length !== 0;
  recentSection.hidden = recentCities.length === 0;
}

function openSavedDrawer() {
  drawerTrigger = document.activeElement;
  savedDrawer.classList.add("open");
  drawerBackdrop.classList.add("open");
  savedDrawer.setAttribute("aria-hidden", "false");
  closeSavedButton.focus();
}

function closeSavedDrawer() {
  savedDrawer.classList.remove("open");
  drawerBackdrop.classList.remove("open");
  savedDrawer.setAttribute("aria-hidden", "true");
  drawerTrigger?.focus();
}

function addRecentCity(city) {
  const recentCities = readStorage(RECENT_CITIES_KEY)
    .filter((item) => item.toLowerCase() !== city.toLowerCase());
  writeStorage(RECENT_CITIES_KEY, [city, ...recentCities].slice(0, 5));
  renderQuickLocations();
}

function getWeatherVisual(code, isDay = true) {
  if (code === 0) return isDay
    ? { icon: "☀️", theme: "clear" }
    : { icon: "🌙", theme: "night" };
  if ([1, 2].includes(code)) return isDay
    ? { icon: "🌤️", theme: "clear" }
    : { icon: "☁️", theme: "night" };
  if (code === 3) return { icon: "☁️", theme: "cloudy" };
  if ([45, 48].includes(code)) return { icon: "🌫️", theme: "fog" };
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) {
    return { icon: "🌧️", theme: "rain" };
  }
  if ([71, 73, 75].includes(code)) return { icon: "❄️", theme: "snow" };
  if ([95, 96, 99].includes(code)) return { icon: "⛈️", theme: "storm" };
  return { icon: "🌡️", theme: "cloudy" };
}

async function getCoordinates(city) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", city);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");

  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not reach the location service.");

  const data = await response.json();
  if (!data.results?.length) throw new Error("City not found. Check the spelling and try again.");

  return data.results[0];
}

async function getLocationName(latitude, longitude) {
  const url = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
  url.searchParams.set("latitude", latitude);
  url.searchParams.set("longitude", longitude);
  url.searchParams.set("localityLanguage", "en");

  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not identify the location name.");

  const data = await response.json();
  const parts = [data.locality, data.principalSubdivision, data.countryName]
    .filter((part, index, allParts) => part && allParts.indexOf(part) === index);

  return parts.join(", ") || "Your current location";
}

async function getCurrentWeather(latitude, longitude) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", latitude);
  url.searchParams.set("longitude", longitude);
  url.searchParams.set("current", "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day,precipitation");
  url.searchParams.set("hourly", "precipitation_probability");
  url.searchParams.set("forecast_hours", "6");
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min");
  url.searchParams.set("forecast_days", "5");
  url.searchParams.set("timezone", "auto");

  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load the weather right now.");
  return response.json();
}

function showForecast(daily) {
  forecastList.innerHTML = daily.time.map((date, index) => {
    const dayName = new Intl.DateTimeFormat("en", { weekday: "short" }).format(
      new Date(`${date}T12:00:00`)
    );
    const description = weatherDescriptions[daily.weather_code[index]] ?? "Unavailable";
    const visual = getWeatherVisual(daily.weather_code[index]);
    const high = Math.round(daily.temperature_2m_max[index]);
    const low = Math.round(daily.temperature_2m_min[index]);

    return `
      <article class="forecast-day">
        <p class="forecast-day-name">${index === 0 ? "Today" : dayName}</p>
        <span class="forecast-icon" role="img" aria-label="${description}">${visual.icon}</span>
        <p class="forecast-condition">${description}</p>
        <p class="forecast-temperature">${high}° <span class="forecast-low">${low}°</span></p>
      </article>
    `;
  }).join("");

  forecastSection.hidden = false;
}

function showWeather(place, current) {
  const area = getPlaceLabel(place);
  const isDay = current.is_day === 1;
  const visual = getWeatherVisual(current.weather_code, isDay);
  elements.location.textContent = area;
  elements.condition.textContent = weatherDescriptions[current.weather_code] ?? "Weather unavailable";
  elements.currentIcon.textContent = visual.icon;
  elements.localTime.textContent = `${formatLocalTime(current.time)} · ${isDay ? "Day" : "Night"}`;
  elements.temperature.textContent = Math.round(current.temperature_2m);
  elements.feelsLike.textContent = Math.round(current.apparent_temperature);
  elements.humidity.textContent = current.relative_humidity_2m;
  elements.windSpeed.textContent = Math.round(current.wind_speed_10m);
  currentPlace = { ...place, displayName: area };
  const alreadySaved = readStorage(SAVED_CITIES_KEY).some((savedPlace) =>
    savedPlace.displayName === currentPlace.displayName
  );
  saveCityButton.textContent = alreadySaved ? "★ Saved" : "☆ Save city";
  saveCityButton.disabled = alreadySaved;
  document.body.dataset.theme = visual.theme;
  weatherCard.hidden = false;
}

function showAdvisory(current, hourly) {
  const rainCodes = [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99];
  const rainChance = Math.max(...(hourly?.precipitation_probability?.slice(0, 3) ?? [0]));
  const isHot = current.temperature_2m >= 32;
  const isRainy = current.precipitation > 0 || rainCodes.includes(current.weather_code) || rainChance >= 50;
  const messages = [];

  if (isHot) messages.push("It’s hot—wear sunscreen, stay hydrated, and carry sunglasses.");
  if (isRainy) messages.push(`Rain ${current.precipitation > 0 ? "is falling" : "may arrive soon"}—carry an umbrella.`);

  if (!messages.length) {
    advisory.hidden = true;
    return;
  }

  advisoryIcon.textContent = isRainy ? "☂️" : "☀️";
  advisoryMessage.textContent = messages.join(" ");
  advisory.className = `advisory ${isRainy ? "rain" : "hot"}`;
  advisory.hidden = false;
}

function formatLocalTime(isoLocalTime) {
  const [datePart, timePart] = isoLocalTime.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));

  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function setLoading(isLoading) {
  searchButton.disabled = isLoading;
  locationButton.disabled = isLoading;
  searchButton.textContent = isLoading ? "Loading…" : "Search";
}

function showError(error) {
  statusMessage.textContent = navigator.onLine
    ? error.message
    : "You appear to be offline. Check your internet connection and try again.";
  statusMessage.classList.add("error");
}

async function loadWeather(place) {
  const weather = await getCurrentWeather(place.latitude, place.longitude);
  showWeather(place, weather.current);
  showForecast(weather.daily);
  showAdvisory(weather.current, weather.hourly);
  statusMessage.textContent = `Updated for ${weather.timezone}.`;
}

async function loadSavedPlace(place) {
  closeSavedDrawer();
  setLoading(true);
  weatherCard.hidden = true;
  forecastSection.hidden = true;
  advisory.hidden = true;
  statusMessage.classList.remove("error");
  statusMessage.textContent = `Loading ${getPlaceLabel(place)}…`;

  try {
    await loadWeather(place);
  } catch (error) {
    showError(error);
  } finally {
    setLoading(false);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const city = cityInput.value.trim();
  if (!city) return;

  setLoading(true);
  weatherCard.hidden = true;
  forecastSection.hidden = true;
  advisory.hidden = true;
  statusMessage.classList.remove("error");
  statusMessage.textContent = `Finding weather for ${city}…`;

  try {
    const place = await getCoordinates(city);
    await loadWeather(place);
    addRecentCity(place.name);
  } catch (error) {
    showError(error);
  } finally {
    setLoading(false);
  }
});

locationButton.addEventListener("click", () => {
  if (!navigator.geolocation) {
    showError(new Error("Location services are not supported by this browser."));
    return;
  }

  setLoading(true);
  weatherCard.hidden = true;
  forecastSection.hidden = true;
  advisory.hidden = true;
  statusMessage.classList.remove("error");
  statusMessage.textContent = "Getting your location…";

  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      try {
        let displayName = "Your current location";

        try {
          displayName = await getLocationName(coords.latitude, coords.longitude);
        } catch {
          // Weather can still load when reverse geocoding is unavailable.
        }

        await loadWeather({
          latitude: coords.latitude,
          longitude: coords.longitude,
          displayName,
        });
      } catch (error) {
        showError(error);
      } finally {
        setLoading(false);
      }
    },
    (error) => {
      const message = error.code === error.PERMISSION_DENIED
        ? "Location permission was denied. Allow it in your browser settings and try again."
        : "Your location could not be determined. Try searching for your city instead.";
      showError(new Error(message));
      setLoading(false);
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
  );
});

saveCityButton.addEventListener("click", () => {
  if (!currentPlace) return;

  const savedCities = readStorage(SAVED_CITIES_KEY);
  if (savedCities.length >= 3) {
    statusMessage.textContent = "You can save up to three cities. Remove one before adding another.";
    statusMessage.classList.add("error");
    return;
  }

  writeStorage(SAVED_CITIES_KEY, [...savedCities, currentPlace]);
  saveCityButton.textContent = "★ Saved";
  saveCityButton.disabled = true;
  statusMessage.classList.remove("error");
  statusMessage.textContent = `${currentPlace.displayName} was saved.`;
  renderQuickLocations();
});

openSavedButton.addEventListener("click", openSavedDrawer);
closeSavedButton.addEventListener("click", closeSavedDrawer);
drawerBackdrop.addEventListener("click", closeSavedDrawer);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && savedDrawer.classList.contains("open")) {
    closeSavedDrawer();
  }
});

renderQuickLocations();
