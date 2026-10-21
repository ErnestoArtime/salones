import { Component, input, computed } from "@angular/core";
const paths: Record<string, string> = {
  portrait: "M8 3H4v4m12-4h4v4M4 17v4h4m8 0h4v-4M16 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM6 20v-1a6 6 0 0 1 12 0v1",
  team: "M4 21v-3a5 5 0 0 1 10 0v3m2-7a4 4 0 0 1 4 4v3M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm4-3a3 3 0 0 1 0 6",
  calendar:
    "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Zm2 10h2m4 0h2m-8 4h2m4 0h2",
  people:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  scissors:
    "m6 6 14 14M6 18 20 4M8 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm0 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-2-5h4l1 3 3-1 2 3-2 3 2 3-2 3-3-1-1 3h-4l-1-3-3 1-2-3 2-3-2-3 2-3 3 1 1-3Z",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  plus: "M12 5v14M5 12h14",
  chevron: "m9 5 7 7-7 7",
  logout: "M9 4H4v16h5m5-12 4 4-4 4m-7-4h11",
  link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2m3 6a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2",
  search: "m21 21-6-6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M6 18 18 6",
  clock: "M12 8v5l3 2m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  menu: "M4 6h16M4 12h16M4 18h16",
  building: "M4 21V3h12v18m0-13h4v13M8 7h4m-4 4h4m-4 4h4m-2 6v-3",
};
@Component({
  selector: "lv-icon",
  standalone: true,
  template:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="path()"/></svg>',
  styles:
    ":host{display:inline-flex;width:20px;height:20px;flex-shrink:0}svg{width:100%;height:100%}",
})
export class Icon {
  name = input("arrow");
  path = computed(() => paths[this.name()] ?? paths["arrow"]);
}
