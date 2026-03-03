import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { FooterComponent, SidebarComponent } from './components';
import { formatDate } from './utils';

console.log(formatDate(new Date()));

@NgModule({
  declarations: [AppComponent, FooterComponent, SidebarComponent],
  imports: [BrowserModule, AppRoutingModule],
  bootstrap: [AppComponent],
})
export class AppModule {}
