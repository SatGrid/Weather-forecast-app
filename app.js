const form = document.querySelector("#search-form");
const cityInput = document.querySelector("#city-input");
const statusMessage = document.querySelector("#status");
const weatherCard = document.querySelector("#weather-card");
const forecastSection = document.querySelector("#forecast-section");
const forecastList = document.querySelector("#forecast-list");
const searchButton = form.querySelector("button");
const locationButton = document.querySelector("#location-button");
const unitToggle = document.querySelector("#unit-toggle");
const openGlobeButton = document.querySelector("#open-globe-button");
const closeGlobeButton = document.querySelector("#close-globe-button");
const globeDialog = document.querySelector("#globe-dialog");
const globeContainer = document.querySelector("#globe-container");
const globeStatus = document.querySelector("#globe-status");
const locationResults = document.querySelector("#location-results");
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
const TEMPERATURE_UNIT_KEY = "weather-temperature-unit";
let currentPlace = null;
let drawerTrigger = null;
let autocompleteTimer = null;
let autocompleteController = null;
let temperatureUnit = localStorage.getItem(TEMPERATURE_UNIT_KEY) === "f" ? "f" : "c";
let latestWeather = null;
let globeInstance = null;
let globeResizeObserver = null;
let globeSelecting = false;

const elements = {
  location: document.querySelector("#location"),
  currentIcon: document.querySelector("#current-icon"),
  condition: document.querySelector("#condition"),
  localTime: document.querySelector("#local-time"),
  temperature: document.querySelector("#temperature"),
  temperatureUnit: document.querySelector("#temperature-unit"),
  feelsLike: document.querySelector("#feels-like"),
  feelsUnit: document.querySelector("#feels-unit"),
  humidity: document.querySelector("#humidity"),
  windSpeed: document.querySelector("#wind-speed"),
};

function displayTemperature(celsius) {
  return Math.round(temperatureUnit === "f" ? (celsius * 9 / 5) + 32 : celsius);
}

function updateUnitControl() {
  const label = temperatureUnit === "c" ? "°C" : "°F";
  const nextLabel = temperatureUnit === "c" ? "Fahrenheit" : "Celsius";
  unitToggle.textContent = label;
  unitToggle.setAttribute("aria-label", `Switch to ${nextLabel}`);
  elements.temperatureUnit.textContent = label;
  elements.feelsUnit.textContent = label;
}

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
  if (place.displayName) return place.displayName;

  return [place.name, place.admin1, place.country]
    .filter((part, index, parts) => part && parts.findIndex(
      (candidate) => candidate?.toLowerCase() === part.toLowerCase()
    ) === index)
    .join(", ");
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
  recentList.replaceChildren(...recentCities.map((item) => {
    if (typeof item === "string") {
      return makeCityChip(item, () => {
        cityInput.value = item;
        form.requestSubmit();
      });
    }
    return makeCityChip(getPlaceLabel(item), () => loadSavedPlace(item));
  }));

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

function addRecentCity(place) {
  const label = getPlaceLabel(place);
  const recentCities = readStorage(RECENT_CITIES_KEY)
    .filter((item) => (typeof item === "string" ? item : getPlaceLabel(item)).toLowerCase() !== label.toLowerCase());
  writeStorage(RECENT_CITIES_KEY, [{ ...place, displayName: label }, ...recentCities].slice(0, 5));
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

async function getLocationMatches(city, signal) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", city);
  url.searchParams.set("count", "6");
  url.searchParams.set("language", "en");

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Could not reach the location service.");

  const data = await response.json();
  if (!data.results?.length) throw new Error("City not found. Check the spelling and try again.");

  return data.results;
}

function showLocationChoices(places, { focusFirst = false } = {}) {
  const buttons = places.map((place) => {
    const button = document.createElement("button");
    const region = [place.admin1, place.country].filter(Boolean).join(", ");
    button.type = "button";
    button.className = "location-result";
    button.textContent = place.name;
    const details = document.createElement("span");
    details.textContent = region;
    button.append(details);
    button.addEventListener("click", async () => {
      locationResults.hidden = true;
      setLoading(true);
      statusMessage.textContent = `Loading ${getPlaceLabel(place)}…`;
      try {
        await loadWeather(place);
        addRecentCity(place);
      } catch (error) {
        showError(error);
      } finally {
        setLoading(false);
      }
    });
    return button;
  });

  locationResults.replaceChildren(...buttons);
  locationResults.hidden = false;
  if (focusFirst) buttons[0]?.focus();
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
    const high = displayTemperature(daily.temperature_2m_max[index]);
    const low = displayTemperature(daily.temperature_2m_min[index]);

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
  elements.temperature.textContent = displayTemperature(current.temperature_2m);
  elements.feelsLike.textContent = displayTemperature(current.apparent_temperature);
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
  openGlobeButton.disabled = isLoading;
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
  latestWeather = { place, current: weather.current, daily: weather.daily };
  showWeather(place, weather.current);
  showForecast(weather.daily);
  showAdvisory(weather.current, weather.hourly);
  weatherCard.classList.remove("weather-reveal");
  forecastSection.classList.remove("weather-reveal");
  requestAnimationFrame(() => {
    weatherCard.classList.add("weather-reveal");
    forecastSection.classList.add("weather-reveal");
  });
  statusMessage.textContent = `Updated for ${weather.timezone}.`;
}

async function loadSavedPlace(place, { addToRecent = false } = {}) {
  closeSavedDrawer();
  setLoading(true);
  locationResults.hidden = true;
  weatherCard.hidden = true;
  forecastSection.hidden = true;
  advisory.hidden = true;
  statusMessage.classList.remove("error");
  statusMessage.textContent = `Loading ${getPlaceLabel(place)}…`;

  try {
    await loadWeather(place);
    if (addToRecent) addRecentCity(place);
  } catch (error) {
    showError(error);
  } finally {
    setLoading(false);
  }
}

function sizeGlobe() {
  if (!globeInstance) return;
  globeInstance.width(globeContainer.clientWidth);
  globeInstance.height(globeContainer.clientHeight);
}

function initializeGlobe() {
  if (globeInstance) {
    sizeGlobe();
    return;
  }

  if (typeof Globe !== "function") {
    globeStatus.textContent = "The 3D globe could not load. Check your internet connection or try another browser.";
    globeStatus.classList.add("error");
    return;
  }

  try {
    globeInstance = new Globe(globeContainer)
      .globeImageUrl("assets/earth-blue-marble.jpg")
      .backgroundColor("rgba(0,0,0,0)")
      .atmosphereColor("#70e1c1")
      .atmosphereAltitude(0.15)
      .ringColor(() => ["#70e1c1", "#70e1c100"])
      .ringMaxRadius(4)
      .ringPropagationSpeed(2)
      .ringRepeatPeriod(550)
      .onGlobeClick(async ({ lat, lng }) => {
        if (globeSelecting) return;
        globeSelecting = true;
        globeInstance.enablePointerInteraction(false);
        globeInstance.controls().autoRotate = false;
        globeInstance.ringsData([{ lat, lng }]);
        globeInstance.pointOfView({ lat, lng, altitude: 0.55 }, 1400);
        globeStatus.classList.remove("error");
        globeStatus.textContent = "Flying to your selected spot…";

        try {
          const placeNamePromise = getLocationName(lat, lng).catch(
            () => `${lat.toFixed(2)}°, ${lng.toFixed(2)}°`
          );
          const [displayName] = await Promise.all([
            placeNamePromise,
            new Promise((resolve) => setTimeout(resolve, 1500)),
          ]);

          globeStatus.textContent = `Opening the sky over ${displayName}…`;
          await new Promise((resolve) => setTimeout(resolve, 350));
          globeDialog.close();
          await loadSavedPlace({ latitude: lat, longitude: lng, displayName }, { addToRecent: true });
        } finally {
          globeInstance.ringsData([]);
          globeInstance.enablePointerInteraction(true);
          globeSelecting = false;
          globeStatus.textContent = "Click the globe to load weather.";
        }
      });

    globeInstance.controls().autoRotate = true;
    globeInstance.controls().autoRotateSpeed = 0.35;
    globeInstance.controls().enableDamping = true;
    sizeGlobe();
    globeResizeObserver = new ResizeObserver(sizeGlobe);
    globeResizeObserver.observe(globeContainer);
  } catch {
    globeStatus.textContent = "This device could not start the 3D globe. City search is still available.";
    globeStatus.classList.add("error");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearTimeout(autocompleteTimer);
  autocompleteController?.abort();
  const city = cityInput.value.trim();
  if (!city) return;

  setLoading(true);
  weatherCard.hidden = true;
  forecastSection.hidden = true;
  advisory.hidden = true;
  statusMessage.classList.remove("error");
  statusMessage.textContent = `Finding weather for ${city}…`;

  try {
    const places = await getLocationMatches(city);
    if (places.length === 1) {
      await loadWeather(places[0]);
      addRecentCity(places[0]);
    } else {
      showLocationChoices(places, { focusFirst: true });
      statusMessage.textContent = `Choose the correct location for “${city}”.`;
    }
  } catch (error) {
    showError(error);
  } finally {
    setLoading(false);
  }
});

cityInput.addEventListener("input", () => {
  clearTimeout(autocompleteTimer);
  autocompleteController?.abort();
  const query = cityInput.value.trim();

  if (query.length < 2) {
    locationResults.hidden = true;
    return;
  }

  autocompleteTimer = setTimeout(async () => {
    autocompleteController = new AbortController();

    try {
      const places = await getLocationMatches(query, autocompleteController.signal);
      if (cityInput.value.trim() === query) showLocationChoices(places);
    } catch (error) {
      if (error.name !== "AbortError") locationResults.hidden = true;
    }
  }, 300);
});

cityInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") locationResults.hidden = true;
});

document.addEventListener("click", (event) => {
  if (!form.contains(event.target) && !locationResults.contains(event.target)) {
    locationResults.hidden = true;
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

openGlobeButton.addEventListener("click", () => {
  globeStatus.classList.remove("error");
  globeStatus.textContent = "Click the globe to load weather.";
  globeDialog.showModal();
  requestAnimationFrame(() => {
    initializeGlobe();
    if (globeInstance) {
      globeInstance.pointOfView({ ...globeInstance.pointOfView(), altitude: 2.1 }, 700);
      globeInstance.controls().autoRotate = true;
    }
  });
});

closeGlobeButton.addEventListener("click", () => globeDialog.close());
globeDialog.addEventListener("click", (event) => {
  if (event.target === globeDialog) globeDialog.close();
});

unitToggle.addEventListener("click", () => {
  temperatureUnit = temperatureUnit === "c" ? "f" : "c";
  localStorage.setItem(TEMPERATURE_UNIT_KEY, temperatureUnit);
  updateUnitControl();

  if (latestWeather) {
    showWeather(latestWeather.place, latestWeather.current);
    showForecast(latestWeather.daily);
  }
});

updateUnitControl();
renderQuickLocations();
