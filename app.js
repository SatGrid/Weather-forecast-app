const form = document.querySelector("#search-form");
const cityInput = document.querySelector("#city-input");
const statusMessage = document.querySelector("#status");
const weatherCard = document.querySelector("#weather-card");
const searchButton = form.querySelector("button");

const elements = {
  location: document.querySelector("#location"),
  condition: document.querySelector("#condition"),
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

async function getCurrentWeather(latitude, longitude) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", latitude);
  url.searchParams.set("longitude", longitude);
  url.searchParams.set("current", "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m");
  url.searchParams.set("timezone", "auto");

  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load the weather right now.");
  return response.json();
}

function showWeather(place, current) {
  const area = place.admin1 ? `${place.name}, ${place.admin1}, ${place.country}` : `${place.name}, ${place.country}`;
  elements.location.textContent = area;
  elements.condition.textContent = weatherDescriptions[current.weather_code] ?? "Weather unavailable";
  elements.temperature.textContent = Math.round(current.temperature_2m);
  elements.feelsLike.textContent = Math.round(current.apparent_temperature);
  elements.humidity.textContent = current.relative_humidity_2m;
  elements.windSpeed.textContent = Math.round(current.wind_speed_10m);
  weatherCard.hidden = false;
}

function setLoading(isLoading) {
  searchButton.disabled = isLoading;
  searchButton.textContent = isLoading ? "Loading…" : "Search";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const city = cityInput.value.trim();
  if (!city) return;

  setLoading(true);
  weatherCard.hidden = true;
  statusMessage.classList.remove("error");
  statusMessage.textContent = `Finding weather for ${city}…`;

  try {
    const place = await getCoordinates(city);
    const weather = await getCurrentWeather(place.latitude, place.longitude);
    showWeather(place, weather.current);
    statusMessage.textContent = `Updated for ${weather.timezone}.`;
  } catch (error) {
    statusMessage.textContent = error.message;
    statusMessage.classList.add("error");
  } finally {
    setLoading(false);
  }
});
