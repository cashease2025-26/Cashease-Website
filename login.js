window.login = function () {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  if (!email || !password) {
    alert("Please enter email and password");
    return;
  }

  firebase.auth().signInWithEmailAndPassword(email, password)
    .then((userCredential) => {
      alert("Login successful!");
      window.location.href = "index.html"; // redirect to dashboard
    })
    .catch((error) => {
      alert("Error: " + error.message);
    });
};

window.signup = function () {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  if (!email || !password) {
    alert("Please enter email and password");
    return;
  }

  firebase.auth().createUserWithEmailAndPassword(email, password)
    .then((userCredential) => {
      alert("Account created successfully! You can now login.");
    })
    .catch((error) => {
      alert("Error: " + error.message);
    });
};
