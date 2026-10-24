import { config } from './config';
import { createApp } from './app';

createApp().listen(config.API_PORT, () => {
  console.log(`API listening on port ${config.API_PORT}`);
});
