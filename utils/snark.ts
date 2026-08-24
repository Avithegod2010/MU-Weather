import { describeWmo } from './wmo';
import type { WeatherBundle } from '../api/types';

export function getSnarkComment(data: WeatherBundle): string {
  const { condition } = describeWmo(data.current.weatherCode);
  const temp = data.current.temperature;
  const seed = new Date().getDate() + Math.round(temp);
  const pick = (lines: string[]): string => lines[seed % lines.length];

  if (temp >= 38) {
    return pick([
      'It is objectively too hot to function. Hydrate or become a raisin.',
      'The sun has chosen violence today.',
      'Outside is a free sauna. You are welcome.',
    ]);
  }
  if (temp <= -5) {
    return pick([
      'Your face will hurt in under a minute. Plan accordingly.',
      'Cold enough that your car will judge you for starting it.',
      'This is the weather your heater dreams about.',
    ]);
  }

  switch (condition) {
    case 'clear':
      return pick([
        'Suspiciously nice out. Something is definitely coming.',
        'The sky is showing off again.',
        'Perfect weather. No excuses left, go outside.',
      ]);
    case 'partlyCloudy':
      return pick([
        'The clouds are just passing through. Probably.',
        'Partly sunny, fully indecisive.',
      ]);
    case 'cloudy':
      return pick([
        'The sky is in its grey era.',
        'Clouds: 1, Sunshine: 0.',
      ]);
    case 'fog':
      return pick([
        'Visibility: vibes.',
        'The fog has main-character energy today.',
      ]);
    case 'drizzle':
      return pick([
        'A light sprinkle, scientifically known as "barely worth an umbrella".',
        'The sky is just spit-washing the city.',
      ]);
    case 'rain':
      return pick([
        'The sky leaked. Again. Shocking.',
        'Rain. Because your hair had other plans.',
        'Water is falling from the sky. This is not a drill.',
      ]);
    case 'showers':
      return pick([
        'On-off showers, like the sky cannot commit.',
        'Bring a jacket, leave the umbrella, regret nothing.',
      ]);
    case 'freezing':
      return pick([
        'Freezing rain: nature installing ice mode without consent.',
        'Everything is slippery now. Walk like a penguin, live longer.',
      ]);
    case 'snow':
      return pick([
        'White stuff from the sky. Drive slowly, hero.',
        'Snow day energy: activated.',
      ]);
    case 'thunder':
      return pick([
        'The sky is angry. Stay inside and charge your phone.',
        'Thunder outside. Your laundry can wait.',
      ]);
    default:
      return pick([
        'Weather is happening. You heard it here first.',
        'The atmosphere remains unpredictable. Classic.',
      ]);
  }
}
