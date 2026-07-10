import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { I18nService } from './app/core/services/i18n.service';

bootstrapApplication(AppComponent, appConfig)
  .then((appRef) => {
    const i18n = appRef.injector.get(I18nService);
    return i18n.init().then(() => appRef);
  })
  .catch((err) => console.error(err));
