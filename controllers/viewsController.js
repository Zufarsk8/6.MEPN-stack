const Tour = require('../models/tourModel');
const Booking = require('../models/bookingModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

exports.getOverview = catchAsync(async (req, res) => {
  // 1) Get tour data from collection
  const tours = await Tour.find();
  // 2) Build template
  // 3) Render that template using tour data from 1
  res.status(200).render('overview', {
    tours,
    title: 'All Tours'
  });
});

// exports.getTour = (req, res) => {
//   res.status(200).render('tour', {
//     title: 'The Forest Hiker'
//   });
// };

exports.getTour = catchAsync(async (req, res, next) => {
  const tour = await Tour.findOne({ slug: req.params.slug }).populate({
    path: 'reviews',
    fields: 'review rating user'
  });

  if (!tour) {
    return next(new AppError('No Tour with that name', 404));
  }
  res.status(200).render('tour', {
    title: `${tour.name} Tour`,
    tour
  });
});
exports.getLoginForm = (req, res) => {
  res.status(200).render('login', {
    title: `Login To Your Account`
  });
};
exports.getAccount = (req, res) => {
  res.status(200).render('account', {
    title: `Your Account`
  });
};
exports.getMyTours = catchAsync(async (req, res) => {
  // 1) Find all bookings
  const bookings = await Booking.find({ user: req.user.id });
  // 2) Find tours with the returned IDs
  const tourIDs = bookings.map(el => el.tour);
  const tours = await Tour.find({ _id: { $in: tourIDs } });

  res.status(200).render('overview', {
    title: 'My Tours',
    tours
  });
});
