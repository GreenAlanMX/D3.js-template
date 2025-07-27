// Global variables
let globalData = [];
const tooltip = d3.select("body").append("div")
  .attr("class", "tooltip");

// Consistent colors
const colorScheme = {
  gender: d3.scaleOrdinal()
    .domain(["Male", "Female"])
    .range(["#667eea", "#764ba2"]),
  category: d3.scaleOrdinal()
    .domain(["Clothing", "Shoes", "Books", "Cosmetics", "Food & Beverage", "Toys", "Technology", "Souvenir"])
    .range(d3.schemeSet3),
  monthly: d3.scaleOrdinal()
    .domain(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])
    .range(d3.schemeCategory10)
};

// Data loading and initialization
d3.csv("customer_shopping_data.csv").then(data => {
  // Data cleaning and processing
  globalData = data.map(d => ({
    ...d,
    age: +d.age,
    quantity: +d.quantity,
    price: +d.price,
    invoice_date: new Date(d.invoice_date)
  }));

  // Update statistics
  updateStats(globalData);
  
  // Create all visualizations
  createSunburstChart(globalData);
  createGenderChart(globalData);
  createHeatmap(globalData);
  createMonthlyTrends(globalData);
});

// Function to update statistics - CORREGIDO
function updateStats(data) {
  const totalCustomers = data.length;
  // CORRECCIÓN: Calcular el revenue total como quantity * price
  const totalRevenue = d3.sum(data, d => d.quantity * d.price);
  const avgPurchase = totalRevenue / totalCustomers;
  // CORRECCIÓN: También calcular por total revenue para la categoría top
  const categoryRevenue = d3.rollup(data, v => d3.sum(v, d => d.quantity * d.price), d => d.category);
  const topCategory = Array.from(categoryRevenue.entries()).sort((a, b) => b[1] - a[1])[0][0];

  d3.select("#total-customers").text(totalCustomers.toLocaleString());
  d3.select("#total-revenue").text(`$${totalRevenue.toLocaleString()}`);
  d3.select("#avg-purchase").text(`$${avgPurchase.toFixed(2)}`);
  d3.select("#top-category").text(topCategory);
}

// 1. Sunburst Chart - CORREGIDO
function createSunburstChart(data) {
  const width = 600;
  const height = 600;
  const radius = Math.min(width, height) / 6;

  const hierarchyData = buildHierarchy(data);
  
  const svg = d3.select("#sunburst").append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [-width / 2, -height / 2, width, width])
    .style("font", "10px sans-serif");

  const hierarchy = d3.hierarchy(hierarchyData)
    .sum(d => d.value)
    .sort((a, b) => b.value - a.value);

  const root = d3.partition()
    .size([2 * Math.PI, hierarchy.height + 1])(hierarchy);

  root.each(d => d.current = d);

  const arc = d3.arc()
    .startAngle(d => d.x0)
    .endAngle(d => d.x1)
    .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005))
    .padRadius(radius * 1.5)
    .innerRadius(d => d.y0 * radius)
    .outerRadius(d => Math.max(d.y0 * radius, d.y1 * radius - 1));

  const path = svg.append("g")
    .selectAll("path")
    .data(root.descendants().slice(1))
    .join("path")
    .attr("fill", d => {
      while (d.depth > 1) d = d.parent;
      return colorScheme.gender(d.data.name);
    })
    .attr("fill-opacity", d => arcVisible(d.current) ? (d.children ? 0.7 : 0.5) : 0)
    .attr("stroke", "#fff")
    .attr("stroke-width", 1)
    .attr("d", d => arc(d.current))
    .style("cursor", "pointer")
    .on("mouseover", function(event, d) {
      tooltip.transition().duration(200).style("opacity", .9);
      tooltip.html(`${d.ancestors().map(d => d.data.name).reverse().join(" → ")}<br/>Value: $${d.value.toLocaleString()}`)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", function() {
      tooltip.transition().duration(500).style("opacity", 0);
    })
    .on("click", clicked);

  const label = svg.append("g")
    .attr("pointer-events", "none")
    .attr("text-anchor", "middle")
    .style("user-select", "none")
    .selectAll("text")
    .data(root.descendants().slice(1))
    .join("text")
    .attr("dy", "0.35em")
    .attr("fill-opacity", d => +labelVisible(d.current))
    .attr("transform", d => labelTransform(d.current))
    .text(d => d.data.name);

  const parent = svg.append("circle")
    .datum(root)
    .attr("r", radius)
    .attr("fill", "none")
    .attr("pointer-events", "all")
    .style("cursor", "pointer")
    .on("click", clicked);

  function clicked(event, p) {
    parent.datum(p.parent || root);

    root.each(d => d.target = {
      x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
      x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
      y0: Math.max(0, d.y0 - p.depth),
      y1: Math.max(0, d.y1 - p.depth)
    });

    const t = svg.transition().duration(750);

    path.transition(t)
      .tween("data", d => {
        const i = d3.interpolate(d.current, d.target);
        return t => d.current = i(t);
      })
      .filter(function(d) {
        return +this.getAttribute("fill-opacity") || arcVisible(d.target);
      })
      .attr("fill-opacity", d => arcVisible(d.target) ? (d.children ? 0.7 : 0.5) : 0)
      .attrTween("d", d => () => arc(d.current));

    label.filter(function(d) {
      return +this.getAttribute("fill-opacity") || labelVisible(d.target);
    }).transition(t)
      .attr("fill-opacity", d => +labelVisible(d.target))
      .attrTween("transform", d => () => labelTransform(d.current));
  }

  function arcVisible(d) {
    return d.y1 <= 3 && d.y0 >= 1 && d.x1 > d.x0;
  }

  function labelVisible(d) {
    return d.y1 <= 3 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.03;
  }

  function labelTransform(d) {
    const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
    const y = (d.y0 + d.y1) / 2 * radius;
    return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
  }
}

// 2. Bar Chart by Gender - CORREGIDO
function createGenderChart(data) {
  const margin = {top: 20, right: 30, bottom: 40, left: 60};
  const width = 400 - margin.left - margin.right;
  const height = 300 - margin.bottom - margin.top;

  // CORRECCIÓN: Usar quantity * price para calcular el revenue por género
  const genderData = Array.from(d3.rollup(data, v => d3.sum(v, d => d.quantity * d.price), d => d.gender));

  const svg = d3.select("#gender-chart").append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom);

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand()
    .domain(genderData.map(d => d[0]))
    .range([0, width])
    .padding(0.3);

  const y = d3.scaleLinear()
    .domain([0, d3.max(genderData, d => d[1])])
    .nice()
    .range([height, 0]);

  g.selectAll(".bar")
    .data(genderData)
    .enter().append("rect")
    .attr("class", "bar clickable")
    .attr("x", d => x(d[0]))
    .attr("width", x.bandwidth())
    .attr("y", height)
    .attr("height", 0)
    .attr("fill", d => colorScheme.gender(d[0]))
    .on("mouseover", function(event, d) {
      tooltip.transition().duration(200).style("opacity", .9);
      tooltip.html(`${d[0]}<br/>Sales: $${d[1].toLocaleString()}`)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", function() {
      tooltip.transition().duration(500).style("opacity", 0);
    })
    .transition()
    .duration(1000)
    .attr("y", d => y(d[1]))
    .attr("height", d => height - y(d[1]));

  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x));

  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y).tickFormat(d => `$${d/1000}K`));
}

// 3. Heatmap - CORREGIDO
function createHeatmap(data) {
  const margin = {top: 50, right: 100, bottom: 60, left: 80};
  const width = 450 - margin.left - margin.right;
  const height = 300 - margin.top - margin.bottom;

  // Process data for heatmap
  const ageRanges = ["<20", "20-29", "30-39", "40-49", "50+"];
  const categories = [...new Set(data.map(d => d.category))];
  
  const heatmapData = [];
  ageRanges.forEach(ageRange => {
    categories.forEach(category => {
      const filtered = data.filter(d => getAgeRange(d.age) === ageRange && d.category === category);
      // CORRECCIÓN: Usar quantity * price para el cálculo del value
      const value = d3.sum(filtered, d => d.quantity * d.price);
      heatmapData.push({ageRange, category, value});
    });
  });

  const svg = d3.select("#heatmap").append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom);

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand()
    .domain(ageRanges)
    .range([0, width])
    .padding(0.05);

  const y = d3.scaleBand()
    .domain(categories)
    .range([height, 0])
    .padding(0.05);

  const colorScale = d3.scaleSequential()
    .interpolator(d3.interpolateBlues)
    .domain([0, d3.max(heatmapData, d => d.value)]);

  g.selectAll(".cell")
    .data(heatmapData)
    .enter().append("rect")
    .attr("class", "cell clickable")
    .attr("x", d => x(d.ageRange))
    .attr("y", d => y(d.category))
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("fill", d => d.value > 0 ? colorScale(d.value) : "#f8f9fa")
    .attr("stroke", "#fff")
    .attr("stroke-width", 1)
    .on("mouseover", function(event, d) {
      tooltip.transition().duration(200).style("opacity", .9);
      tooltip.html(`${d.ageRange} years<br/>${d.category}<br/>Sales: $${d.value.toLocaleString()}`)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", function() {
      tooltip.transition().duration(500).style("opacity", 0);
    });

  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x));

  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y));
}

// 4. Monthly Purchase Trends - CORREGIDO
function createMonthlyTrends(data) {
  const margin = {top: 20, right: 80, bottom: 60, left: 80};
  const width = 900 - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  // Get available years and populate selector
  const years = [...new Set(data.map(d => d.invoice_date.getFullYear()))].sort();
  const yearSelect = d3.select("#year-select");
  
  years.forEach(year => {
    yearSelect.append("option").attr("value", year).text(year);
  });

  // Create SVG
  const svg = d3.select("#monthly-trends").append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom);

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Scales
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const x = d3.scaleBand()
    .domain(months)
    .range([0, width])
    .padding(0.1);

  const y = d3.scaleLinear()
    .range([height, 0]);

  // Area generator
  const area = d3.area()
    .x(d => x(d.month) + x.bandwidth() / 2)
    .y0(height)
    .y1(d => y(d.value))
    .curve(d3.curveMonotoneX);

  // Line generator
  const line = d3.line()
    .x(d => x(d.month) + x.bandwidth() / 2)
    .y(d => y(d.value))
    .curve(d3.curveMonotoneX);

  // Axes
  const xAxis = g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height})`);

  const yAxis = g.append("g")
    .attr("class", "axis");

  // Chart elements
  const areaPath = g.append("path").attr("class", "area");
  const linePath = g.append("path").attr("class", "line");
  const dotsGroup = g.append("g").attr("class", "dots");

  // Update function
  function updateChart(selectedYear) {
    let filteredData = data;
    
    if (selectedYear !== "all") {
      filteredData = data.filter(d => d.invoice_date.getFullYear() == selectedYear);
    }

    // Process monthly data - CORRECCIÓN: Usar quantity * price
    const monthlyData = d3.rollup(filteredData, 
      v => d3.sum(v, d => d.quantity * d.price), 
      d => d.invoice_date.getMonth()
    );

    const chartData = months.map((month, i) => ({
      month: month,
      value: monthlyData.get(i) || 0
    }));

    // Update scales
    y.domain([0, d3.max(chartData, d => d.value)]).nice();

    // Update axes
    xAxis.transition().duration(750).call(d3.axisBottom(x));
    yAxis.transition().duration(750).call(d3.axisLeft(y).tickFormat(d => `${d/1000}K`));

    // Update area
    areaPath
      .datum(chartData)
      .transition()
      .duration(750)
      .attr("d", area)
      .attr("fill", "url(#gradient)")
      .attr("fill-opacity", 0.6);

    // Update line
    linePath
      .datum(chartData)
      .transition()
      .duration(750)
      .attr("d", line)
      .attr("stroke", "#667eea")
      .attr("stroke-width", 3)
      .attr("fill", "none");

    // Update dots
    const dots = dotsGroup.selectAll(".dot")
      .data(chartData);

    dots.exit().remove();

    dots.enter().append("circle")
      .attr("class", "dot clickable")
      .attr("r", 0)
      .merge(dots)
      .on("mouseover", function(event, d) {
        tooltip.transition().duration(200).style("opacity", .9);
        tooltip.html(`${d.month}<br/>Sales: ${d.value.toLocaleString()}`)
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px");
      })
      .on("mouseout", function() {
        tooltip.transition().duration(500).style("opacity", 0);
      })
      .transition()
      .duration(750)
      .attr("cx", d => x(d.month) + x.bandwidth() / 2)
      .attr("cy", d => y(d.value))
      .attr("r", 5)
      .attr("fill", "#667eea")
      .attr("stroke", "#fff")
      .attr("stroke-width", 2);
  }

  // Create gradient for area
  const gradient = svg.append("defs")
    .append("linearGradient")
    .attr("id", "gradient")
    .attr("gradientUnits", "userSpaceOnUse")
    .attr("x1", 0).attr("y1", height)
    .attr("x2", 0).attr("y2", 0);

  gradient.append("stop")
    .attr("offset", "0%")
    .attr("stop-color", "#667eea")
    .attr("stop-opacity", 0.1);

  gradient.append("stop")
    .attr("offset", "100%")
    .attr("stop-color", "#667eea")
    .attr("stop-opacity", 0.8);

  // Event listener for year filter
  yearSelect.on("change", function() {
    updateChart(this.value);
  });

  // Initial chart render
  updateChart("all");
}

// Helper function to build hierarchy for sunburst - CORREGIDO
function buildHierarchy(data) {
  const root = { name: "root", children: [] };

  const group = d3.group(data, d => d.gender, d => getAgeRange(+d.age), d => d.category);

  for (const [gender, ageMap] of group.entries()) {
    const genderNode = { name: gender, children: [] };

    for (const [ageRange, categoryMap] of ageMap.entries()) {
      const ageNode = { name: ageRange, children: [] };

      for (const [category, records] of categoryMap.entries()) {
        // CORRECCIÓN: Usar quantity * price para el total
        const total = d3.sum(records, d => d.quantity * d.price);
        ageNode.children.push({ name: category, value: total });
      }

      genderNode.children.push(ageNode);
    }

    root.children.push(genderNode);
  }

  return root;
}

// Helper function to convert age to ranges
function getAgeRange(age) {
  if (age < 20) return "<20";
  if (age < 30) return "20-29";
  if (age < 40) return "30-39";
  if (age < 50) return "40-49";
  return "50+";
}