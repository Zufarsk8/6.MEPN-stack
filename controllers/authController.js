const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/userModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const Email = require('../utils/email');

const signToken = id => {
  return jwt.sign({ id: id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
};

const createSignToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  const cookieOption = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true
  };

  if (process.env.NODE_env === 'production') cookieOption.secure = true;

  res.cookie('jwt', token, cookieOption);

  user.password = undefined;

  return res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user: user
    }
  });
};

exports.signup = catchAsync(async (req, res, next) => {
  // not safe
  // const newUser = await User.create(req.body);
  // Safe
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
    passwordChangedAt: req.body.passwordChangedAt,
    role: req.body.role
  });
  const url = `${req.protocol}://${req.get('host')}/me`;
  // console.log(url);
  await new Email(newUser, url).sendWelcome();

  createSignToken(newUser, 201, res);
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // 1) Check if email and password exist
  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }
  // 2) Check if user exists && password is correct
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('Incorrect email or password'), 401);
  }
  // 3) If everything is ok, send token to client
  createSignToken(user, 200, res);
});

exports.logout = (req, res) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 1000 * 10),
    httpOnly: true
  });

  res.status(200).json({
    status: 'success'
  });
};

exports.protect = catchAsync(async (req, res, next) => {
  // 1) Getting token and check if it's there
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }
  if (!token) {
    return next(
      new AppError('You are not logged in! Please log in to get access.', 401)
    );
  }
  // 2) Verify token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // 3) Check if user still exist
  const freshUser = await User.findById(decoded.id);
  if (!freshUser) {
    return next(
      new AppError('The user belonging to this token no longer exist', 401)
    );
  }
  // 4) Check if user changed password after the toke was issued
  if (freshUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError('User recently changed password. Please log in again.', 401)
    );
  }
  // Grant acces to protected route
  res.locals.user = freshUser;
  req.user = freshUser;

  next();
});

// only for rendered pages, no errors
exports.isLoggedIn = async (req, res, next) => {
  try {
    if (req.cookies.jwt) {
      // 2) Verify token
      const decoded = await promisify(jwt.verify)(
        req.cookies.jwt,
        process.env.JWT_SECRET
      );

      // 3) Check if user still exist
      const freshUser = await User.findById(decoded.id);
      if (!freshUser) {
        return next();
      }
      // 4) Check if user changed password after the toke was issued
      if (freshUser.changedPasswordAfter(decoded.iat)) {
        return next();
      }
      // THERE IS A LOGGED IN USER
      res.locals.user = freshUser;
      return next();
    }
  } catch (err) {
    return next();
  }
  next();
};

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have permission to access this route', 403)
      );
    }
    next();
  };
};

exports.forgotPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on POSTed email res.body.email
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return next(new AppError('There is no user with this email address.', 404));
  }
  // 2) generate the random reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });
  // 3) Sent it to user's email

  try {
    const resetURL = `${req.protocol}://${req.get(
      'host'
    )}/api/v1/users/resetPassword/${resetToken}`;
    await new Email(user, resetURL).sendPasswordReset();

    res.status(200).json({
      status: 'success',
      message: 'Token sent to email'
    });
  } catch (err) {
    console.log(err);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(new AppError('There was an error sending the email'), 500);
  }
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  //  1) Get user based on the token
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    PasswordResetExpire: { $gt: Date.now() }
  });

  if (!user) {
    return next(new AppError('User does not exist or token has expired'), 400);
  }
  //  2) If token has not expired, and there is user, set the new password
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.PasswordResetExpire = undefined;
  await user.save();
  //  3) update changedPasswordAt property for the user
  // user.passwordChangedAt = Date.now();
  // update in middleware on userModel
  //  4) log the user in, send jwt
  createSignToken(user, 200, res);
});

exports.updatePassword = async (req, res, next) => {
  // 1) Get user from collection
  const user = await User.findOne({ email: req.user.email }).select(
    '+password'
  );
  console.log(await bcrypt.hash(req.body.oldPassword, 12));

  // 2) check is posted current pass is correct
  if (!(await user.correctPassword(req.body.oldPassword, user.password))) {
    return next(new AppError('Old password is wrong', 401));
  }
  // 3) if correct, update
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  await user.save();
  // 4) log user in
  createSignToken(user, 200, res);
};
