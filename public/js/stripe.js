/* eslint-disable */
import axios from 'axios';
var stripe = Stripe('pk_test_59ZiYRTgslHi0BfAnmkl9CMd00o4PDMphC');
import { showAlert } from './alert';

export const bookTour = async tourId => {
  try {
    // 1) get the session from server
    const session = await axios({
      method: 'GET',
      url: `/api/v1/bookings/checkout-session/${tourId}`
    });

    //   2) create checkout form + charge credit card
    await stripe.redirectToCheckout({
      sessionId: session.data.session.id
    });
  } catch (err) {
    showAlert('error', err);
  }
};
