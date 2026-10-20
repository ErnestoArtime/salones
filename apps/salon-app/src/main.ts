import { bootstrapApplication } from "@angular/platform-browser";
import { provideIonicAngular } from "@ionic/angular";
import { SalonApp } from "./salon.component";
bootstrapApplication(SalonApp, {
  providers: [provideIonicAngular({ mode: "ios" })],
}).catch(console.error);
