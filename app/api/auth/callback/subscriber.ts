export async function getSubscriberStatus(email: string) {
  try {
    const res = await fetch(
      `https://optiboy.gradientsandgrit.com/admin/${email}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPTIBOY_TOKEN}`,
        },
      },
    );
    if (res.status === 404) {
      return false;
    }

    if (res.status === 200) {
      return true;
    }

    throw new Error("Unexpected status");
  } catch (err) {
    throw new Error("Could not check subscriber status");
  }
}

export async function forceSubscribe(email: string) {
  try {
    const res = await fetch(
      `https://optiboy.gradientsandgrit.com/admin/${email}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPTIBOY_TOKEN}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({
          source: "langsync-subscribe",
        }),
      },
    );

    if (res.status === 200) {
      return;
    }

    throw new Error("Unexpected status");
  } catch (err) {
    throw new Error("Could not subscribe user");
  }
}
