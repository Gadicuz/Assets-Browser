import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AuthGuard } from './guards/guard.auth';
import { LocationComponent } from './location/location.component';
import { OrdersComponent } from './orders/orders.component';

const routes: Routes = [
  { path: 'browse/:id/:mode', canActivate: [AuthGuard], component: LocationComponent },
  { path: 'browse/:id', redirectTo: 'browse/:id/', pathMatch: 'full' },
  { path: 'browse', redirectTo: 'browse/universe/', pathMatch: 'full' },
  { path: 'orders', canActivate: [AuthGuard], component: OrdersComponent },
  { path: '', children: [] },
  { path: '**', redirectTo: '/', pathMatch: 'full' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { enableTracing: false, relativeLinkResolution: 'legacy' })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
