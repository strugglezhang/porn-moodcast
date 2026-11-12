import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudSnow,
  Sun,
  Wind,
  CloudRain,
  CloudHail,
  Rainbow,
  CloudRainWind,
  Tornado,
} from "lucide-react";
import type { Weather } from "./weather";

export default function WeatherIcon({
  weather,
  size = 26,
}: {
  weather: Weather;
  size?: number;
}) {
  const Icon = {
    sunny: Sun,
    cloudy: Cloud,
    fog: CloudFog,
    rain: CloudDrizzle,
    storm: CloudLightning,
    snow: CloudSnow,
    wind: Wind,
    downpour: CloudRain,
    hail: CloudHail,
    rainbow: Rainbow,
    typhoon: CloudRainWind,
    tornado: Tornado,
  }[weather];
  return <Icon size={size} strokeWidth={1.5} aria-hidden="true" />;
}
