/* eslint-disable */

export const displayMap = locations => {
  mapboxgl.accessToken =
    'pk.eyJ1IjoienVmYXJzazgiLCJhIjoiY2s5cjdqeW13MHFucDNucjFvbWpuN3UyYyJ9.XwdZQLzR6y9MKOQNZaN-4w';
  var map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/zufarsk8/ck9r7qqtm0hf61jl3jpkj03e8',
    scrollZoom: false
  });

  const bounds = new mapboxgl.LngLatBounds();

  locations.forEach(loc => {
    const el = document.createElement('div');
    el.className = 'marker';

    new mapboxgl.Marker({
      element: el,
      anchor: 'bottom'
    })
      .setLngLat(loc.coordinates)
      .addTo(map);

    // add popup
    new mapboxgl.Popup({ offset: 30 })
      .setLngLat(loc.coordinates)
      .setHTML(`<p>Day ${loc.day} ${loc.description}</p>`)
      .addTo(map);

    bounds.extend(loc.coordinates);
  });

  map.fitBounds(bounds, {
    padding: { top: 200, bottom: 150, left: 100, right: 100 }
  });
};
