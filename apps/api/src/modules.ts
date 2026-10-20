import { PagesController, PageStorage } from "./modules/pages/pages.controller";
import { StudioController } from "./modules/studio/studio.controller";
import { StudioStorage } from "./modules/studio/studio.storage";
import { StudioProvider } from "./modules/studio/studio.provider";
import { StudioWorker } from "./modules/studio/studio.worker";
import { Module, Global } from "@nestjs/common";
import { Database } from "./database";
import { Auth } from "./auth";
import { Booking } from "./booking";
import { AuthController } from "./modules/auth/auth.controller";
import { TenantsController } from "./modules/tenants/tenants.controller";
import { CatalogController } from "./modules/catalog/catalog.controller";
import { TeamController } from "./modules/team/team.controller";
import { CustomersController } from "./modules/customers/customers.controller";
import { AppointmentsController } from "./modules/appointments/appointments.controller";
import { PublicBookingController } from "./modules/public-booking/public-booking.controller";
import { PlatformController } from "./modules/platform/platform.controller";
@Global()
@Module({ providers: [Database, Auth], exports: [Database, Auth] })
export class CoreModule {}
@Module({ providers: [Booking], exports: [Booking] })
export class BookingEngineModule {}
@Module({ controllers: [AuthController], imports: [] })
export class AuthModule {}
@Module({ controllers: [TenantsController], imports: [] })
export class TenantsModule {}
@Module({ controllers: [CatalogController], imports: [] })
export class CatalogModule {}
@Module({ controllers: [TeamController], imports: [] })
export class TeamModule {}
@Module({ controllers: [CustomersController], imports: [] })
export class CustomersModule {}
@Module({
  controllers: [AppointmentsController],
  imports: [BookingEngineModule],
})
export class AppointmentsModule {}
@Module({
  controllers: [PublicBookingController],
  imports: [BookingEngineModule],
})
export class PublicBookingModule {}
@Module({ controllers: [PlatformController], imports: [] })
export class PlatformModule {}
@Module({
  controllers: [StudioController],
  providers: [StudioStorage, StudioProvider, StudioWorker],
  imports: [BookingEngineModule],
})
export class StudioModule {}
@Module({ controllers: [PagesController], providers: [PageStorage] })
export class PagesModule {}
export const domainModules = [
  PagesModule,
  StudioModule,
  CoreModule,
  AuthModule,
  TenantsModule,
  CatalogModule,
  TeamModule,
  CustomersModule,
  AppointmentsModule,
  PublicBookingModule,
  PlatformModule,
];
