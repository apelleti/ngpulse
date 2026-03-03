import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminRoutingModule } from './admin-routing.module';
import { DashboardComponent } from './dashboard/dashboard.component';
import { UsersComponent } from './users/users.component';

@NgModule({
  declarations: [DashboardComponent, UsersComponent],
  imports: [CommonModule, AdminRoutingModule],
})
export class AdminModule {}
