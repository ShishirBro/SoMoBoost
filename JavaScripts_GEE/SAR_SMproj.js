// Load your point shapefile
var pointShapefileAssetId = 'projects/ee-shishirchaulagain4/assets/unique_coords';
var points = ee.FeatureCollection(pointShapefileAssetId);

// Define time range
var start = ee.Date('2024-01-01');
var end = ee.Date('2024-12-31');

// Load datasets
var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterBounds(points)
  .filterDate(start, end)
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  .filter(ee.Filter.eq('instrumentMode', 'IW'));

var chirps = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
  .filterBounds(points)
  .filterDate(start, end);

var srtm = ee.Image('USGS/SRTMGL1_003');

// Function to extract value at point
function getValue(image, band, point) {
  return image.select(band).reduceRegion({
    reducer: ee.Reducer.first(),
    geometry: point.geometry(),
    scale: image.select(band).projection().nominalScale(),
    maxPixels: 1e13
  }).get(band);
}

// Generate list of daily dates
var dateList = ee.List.sequence(start.millis(), end.millis(), 24 * 60 * 60 * 1000).map(function(d) {
  return ee.Date(d);
});

// Iterate over each date and create features
var allFeatures = ee.FeatureCollection(dateList.iterate(function(date, prev) {
  date = ee.Date(date);
  var nextDate = date.advance(1, 'day');
  var prevFC = ee.FeatureCollection(prev);

  var s1Img = s1.filterDate(date, nextDate).first();
  var chirpsImg = chirps.filterDate(date, nextDate).first();

  var dailyFC = points.map(function(point) {
    var coords = point.geometry().coordinates();
    var lon = coords.get(0);
    var lat = coords.get(1);

    return ee.Feature(null, {
      'date': date.format('YYYY-MM-dd'),
      'latitude [°]': lat,
      'longitude [°]': lon,
      'VV [dB]': ee.Algorithms.If(s1Img, getValue(s1Img, 'VV', point), null),
      'VH [dB]': ee.Algorithms.If(s1Img, getValue(s1Img, 'VH', point), null),
      'angle [degrees]': ee.Algorithms.If(s1Img, getValue(s1Img, 'angle', point), null),
      'precipitation [mm]': ee.Algorithms.If(chirpsImg, getValue(chirpsImg, 'precipitation', point), 0),
      'elevation [m]': getValue(srtm, 'elevation', point)
    });
  });

  return prevFC.merge(dailyFC);
}, ee.FeatureCollection([])));

// Preview
print('Daily features (sample):', allFeatures.limit(5));

// Export as CSV
Export.table.toDrive({
  collection: allFeatures,
  description: 'Sentinel_CHIRPS_SRTM_Extract_LatLon',
  fileFormat: 'CSV',
  selectors: [
    'date',
    'latitude [°]',
    'longitude [°]',
    'VV [dB]',
    'VH [dB]',
    'angle [degrees]',
    'precipitation [mm]',
    'elevation [m]'
  ]
});
