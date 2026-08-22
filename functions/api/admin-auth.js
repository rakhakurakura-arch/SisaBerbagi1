export async function onRequestPost(context) {
  try {
    const correctPassword = context.env.ADMIN_PASSWORD;
    if (!correctPassword) {
      return new Response(JSON.stringify({ error: "ADMIN_PASSWORD belum diatur di server." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { password } = await context.request.json();

    if (password === correctPassword) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } else {
      return new Response(JSON.stringify({ success: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
